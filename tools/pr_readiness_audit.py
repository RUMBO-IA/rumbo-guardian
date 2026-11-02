#!/usr/bin/env python3
"""Read-only, fail-closed GitHub org PR triage. Never grants merge authority.

Usage:
  GITHUB_TOKEN=... python scripts/pr_readiness_audit.py --org RUMBO-IA --max-prs 50
  GITHUB_TOKEN=... python scripts/pr_readiness_audit.py --org RUMBO-IA --all --max-requests 1500

Requires only Python standard library. Stdout JSON is inspectable and machine-readable.
No credentials are logged or stored. No mutations, reviews, re-runs or billing actions.
"""
import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


class BudgetExceeded(RuntimeError):
    pass


class GithubReader:
    def __init__(self, token, max_requests=200):
        self.token = token
        self.max_requests = max_requests
        self.count = 0

    def get(self, path):
        if self.count >= self.max_requests:
            raise BudgetExceeded('request budget reached')
        if not path.startswith('/') or '://' in path or '\\' in path or '#' in path:
            raise ValueError('invalid GitHub path')
        self.count += 1
        headers = {'Accept':'application/vnd.github+json', 'User-Agent':'RUMBO-readonly-pr-audit/1',
                   'X-GitHub-Api-Version':'2022-11-28'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        request = urllib.request.Request('https://api.github.com'+path, headers=headers, method='GET')
        try:
            with urllib.request.urlopen(request,timeout=15) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError('GitHub API HTTP '+str(error.code)+' (audit incomplete)') from None
        except (TimeoutError,urllib.error.URLError) as error:
            raise RuntimeError('GitHub API transport failed: '+type(error).__name__) from None


def pages(client, path, key=None):
    page = 1
    while True:
        suffix = ('&' if '?' in path else '?') + f'per_page=100&page={page}'
        response = client.get(path+suffix)
        if key:
            if not isinstance(response,dict) or not isinstance(response.get(key),list):
                raise ValueError('invalid GitHub paginated response')
            items = response[key]
        else:
            if not isinstance(response,list):
                raise ValueError('invalid GitHub paginated response')
            items = response
        yield from items
        if len(items)<100:
            return
        page += 1


def analyze_pr(repo, pull, checks, reviews):
    # Important: a completed green check is not authoritative CI provenance.
    # Duplicate check names may represent distinct push/PR suites; never collapse them.
    states = [str(x.get('status','')).lower() for x in checks]
    conclusions = [str(x.get('conclusion') or '').lower() for x in checks]
    if not checks:
        check_state = 'ABSENT'
    elif any(v in {'failure','timed_out','cancelled','action_required','startup_failure'} for v in conclusions):
        check_state = 'FAILED'
    elif any(s != 'completed' for s in states) or any(v == '' for v in conclusions):
        check_state = 'PENDING'
    elif any(v not in {'success','skipped','neutral'} for v in conclusions):
        check_state = 'UNVERIFIED'
    elif all(v in {'skipped','neutral'} for v in conclusions):
        check_state = 'NO_EXECUTED_PASS'
    else:
        check_state = 'GREEN_UNATTESTED'

    newest_by_user = {}
    for review in sorted(reviews,key=lambda r:str(r.get('submitted_at') or '')):
        user = (review.get('user') or {}).get('login')
        state = str(review.get('state') or '').upper()
        if user and state in {'APPROVED','CHANGES_REQUESTED','DISMISSED'}:
            newest_by_user[user] = state
    approved=sum(s=='APPROVED' for s in newest_by_user.values())
    changes=sum(s=='CHANGES_REQUESTED' for s in newest_by_user.values())
    base=(pull.get('base') or {}).get('ref')
    head=(pull.get('head') or {}).get('sha')
    blockers=[]
    if pull.get('draft') is True:blockers.append('DRAFT')
    if base!='main':blockers.append('STACKED_BASE')
    if not head or len(head)!=40: blockers.append('HEAD_UNVERIFIED')
    if check_state=='ABSENT':blockers.append('NO_CHECK_RUNS')
    if check_state=='FAILED':blockers.append('FAILED_CHECK')
    if check_state=='PENDING':blockers.append('PENDING_CHECK')
    if check_state in {'UNVERIFIED','NO_EXECUTED_PASS'}:blockers.append('INSUFFICIENT_CHECKS')
    if changes:blockers.append('CHANGES_REQUESTED')
    if not approved:blockers.append('NO_APPROVAL_OBSERVED')
    blockers.append('PROVENANCE_UNVERIFIED')
    blockers.append('RULESET_AND_QUEUE_UNVERIFIED')
    return {
        'repo':repo,'number':pull.get('number'),'url':pull.get('html_url'),
        'head_sha':head,'base':base,'base_sha':(pull.get('base') or {}).get('sha'),
        'updated_at':pull.get('updated_at'),'draft':pull.get('draft'),
        'check_count':len(checks),'check_state':check_state,
        'approvals':approved,'changes_requested':changes,
        'blockers':blockers,'merge_authorized':False
    }


def require_unchanged_pr_snapshot(original, refreshed):
    """Fail closed when a PR moves while checks/reviews are being inspected."""
    if not isinstance(original, dict) or not isinstance(refreshed, dict):
        raise ValueError('invalid PR readback')

    def identity(item):
        head, base = item.get('head') or {}, item.get('base') or {}
        if not isinstance(head, dict) or not isinstance(base, dict):
            raise ValueError('invalid PR readback')
        return (
            item.get('number'), item.get('state'), item.get('draft'),
            head.get('sha'), base.get('ref'), base.get('sha'),
            item.get('updated_at'),
        )
    if identity(original) != identity(refreshed):
        raise ValueError('PR state changed during audit: exact HEAD or review snapshot stale')


def audit_organization(client, org, max_prs=50):
    report={'schema':'rumbo.pr-readiness-readonly/v1','org':org,'complete':False,
            'generated_at':datetime.now(timezone.utc).isoformat(),
            'count':0,'repos_scanned':0,'items':[],'error':None,
            'limitations':['Read-only; no merge authorization','Check-run event provenance not verified',
                           'Required status checks, current branch rulesets and merge queue not verified',
                           'Visibility limited to repositories readable by supplied token']}
    try:
        if not org or not all(c.isalnum() or c=='-' for c in org):
            raise ValueError('invalid organization name')
        for repo in pages(client,'/orgs/'+org+'/repos?type=all'):
            full=repo.get('full_name')
            if not full or not full.startswith(org+'/') or repo.get('archived'):
                continue
            report['repos_scanned']+=1
            path='/repos/'+full
            for pull in pages(client,path+'/pulls?state=open'):
                if report['count'] >= max_prs:
                    raise BudgetExceeded('PR scan cap reached: partial report')
                number=pull.get('number')
                sha=(pull.get('head') or {}).get('sha')
                if type(number) is not int or type(sha) is not str or len(sha)!=40 or any(c not in '0123456789abcdefABCDEF' for c in sha):
                    raise ValueError('invalid PR number or head sha')
                checks=list(pages(client,path+'/commits/'+sha+'/check-runs',key='check_runs'))
                reviews=list(pages(client,path+'/pulls/'+str(number)+'/reviews'))
                fresh=client.get(path+'/pulls/'+str(number))
                require_unchanged_pr_snapshot(pull,fresh)
                report['items'].append(analyze_pr(full,pull,checks,reviews))
                report['count']+=1
        report['complete']=True
    except (BudgetExceeded,ValueError,RuntimeError) as exc:
        report['error']=str(exc)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org',default='RUMBO-IA')
    parser.add_argument('--max-prs',type=int,default=50)
    parser.add_argument('--max-requests',type=int,default=200)
    parser.add_argument('--all',action='store_true',help='allow up to 5,000 PRs (still bounded by --max-requests)')
    parser.add_argument('--format',choices=['json','csv'],default='json')
    args=parser.parse_args()
    if args.max_requests<1 or args.max_requests>10000 or args.max_prs<1:
        parser.error('request and PR limits must be positive, maximum 10000 requests')
    max_prs=5000 if args.all else args.max_prs
    token=os.getenv('GITHUB_TOKEN') or os.getenv('GH_TOKEN')
    if not token:
        parser.error('GITHUB_TOKEN or GH_TOKEN is required for complete private-org inventory (never echoed)')
    report=audit_organization(GithubReader(token,args.max_requests),args.org,max_prs)
    if args.format=='json':
        print(json.dumps(report,ensure_ascii=False,indent=2))
    else:
        writer=csv.DictWriter(sys.stdout,fieldnames=['repo','number','url','head_sha','base','draft','check_state','check_count','approvals','changes_requested','blockers','merge_authorized'])
        writer.writeheader()
        for item in report['items']:
            writer.writerow({k:';'.join(item[k]) if k=='blockers' else item.get(k) for k in writer.fieldnames})
        print(f'# complete={report["complete"]} scanned={report["count"]} error={report["error"] or "none"}',file=sys.stderr)
    return 0 if report['complete'] else 2


if __name__=='__main__':
    sys.exit(main())

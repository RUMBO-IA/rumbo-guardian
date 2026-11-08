#!/usr/bin/env python3
"""Read-only, fail-closed GitHub org PR triage. Never grants merge authority.

Usage:
  GITHUB_TOKEN=... python tools/pr_readiness_audit.py --org RUMBO-IA --max-prs 50
  GITHUB_TOKEN=... python tools/pr_readiness_audit.py --org RUMBO-IA --all --max-requests 1500

Requires only Python standard library. Stdout JSON is inspectable and machine-readable.
No credentials are logged or stored. No mutations, reviews, re-runs or billing actions.
"""
import argparse
import csv
import json
import http.client
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


class BudgetExceeded(RuntimeError):
    pass


class StrictGitHubNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise RuntimeError('GitHub API redirect refused (audit incomplete)')


class GithubReader:
    def __init__(self, token, max_requests=200):
        self.token = token
        self.max_requests = max_requests
        self.count = 0

    def get(self, path):
        if not path.startswith('/') or '://' in path or '\\' in path or '#' in path:
            raise ValueError('invalid GitHub path')
        headers = {'Accept':'application/vnd.github+json', 'User-Agent':'RUMBO-readonly-pr-audit/1',
                   'X-GitHub-Api-Version':'2022-11-28'}
        request = urllib.request.Request('https://api.github.com'+path, headers=headers, method='GET')
        if self.token:
            request.add_unredirected_header('Authorization', 'Bearer ' + self.token)
        for attempt in range(3):
            if self.count >= self.max_requests:
                raise BudgetExceeded('request budget reached')
            self.count += 1
            try:
                with urllib.request.build_opener(StrictGitHubNoRedirect()).open(request,timeout=15) as response:
                    if callable(getattr(response,'geturl',None)) and response.geturl()!=request.full_url:
                        raise RuntimeError('GitHub API redirect refused (audit incomplete)')
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code in (500, 502, 503, 504) and attempt < 2:
                    continue
                raise RuntimeError('GitHub API HTTP '+str(error.code)+' (audit incomplete)') from None
            except (json.JSONDecodeError,UnicodeDecodeError) as error:
                raise RuntimeError('GitHub API invalid JSON (audit incomplete)') from None
            except http.client.RemoteDisconnected as error:
                if attempt < 2:
                    continue
                raise RuntimeError('GitHub API transport failed: '+type(error).__name__) from None
            except (TimeoutError,urllib.error.URLError,http.client.IncompleteRead) as error:
                raise RuntimeError('GitHub API transport failed: '+type(error).__name__) from None


def pages(client, path, key=None):
    page = 1
    declared_total = None
    yielded = 0
    seen_check_ids = set()
    while True:
        suffix = ('&' if '?' in path else '?') + f'per_page=100&page={page}'
        response = client.get(path+suffix)
        if key:
            if not isinstance(response,dict) or not isinstance(response.get(key),list):
                raise ValueError('invalid GitHub paginated response')
            items = response[key]
            if key == 'check_runs':
                if type(response.get('total_count')) is not int:
                    raise ValueError('incomplete check-runs: missing or invalid total_count')
                total = response['total_count']
                if total < 0 or (declared_total is not None and total != declared_total):
                    raise ValueError('incomplete check-runs: inconsistent declared total_count')
                declared_total = total
        else:
            if not isinstance(response,list):
                raise ValueError('invalid GitHub paginated response')
            items = response
        if key == 'check_runs':
            for item in items:
                if not isinstance(item,dict):
                    raise ValueError('invalid check-run record')
                check_id = item.get('id')
                if type(check_id) is not int or check_id <= 0:
                    raise ValueError('invalid check-run id')
                if check_id in seen_check_ids:
                    raise ValueError('duplicate check-run id in paginated response')
                seen_check_ids.add(check_id)
        yielded += len(items)
        if key == 'check_runs' and declared_total is not None and yielded > declared_total:
            raise ValueError('incomplete check-runs: more records than declared')
        yield from items
        if len(items)<100:
            if key == 'check_runs' and declared_total is not None and yielded != declared_total:
                raise ValueError('incomplete check-runs: fewer records than declared')
            return
        page += 1


def latest_commit_status_checks(statuses):
    """Retain latest REST commit status for each context (newest-first API order)."""
    most_recent = {}
    for status in statuses:
        if not isinstance(status, dict):
            raise ValueError('invalid commit status record')
        name, state = status.get('context'), status.get('state')
        if not isinstance(name, str) or not name or not isinstance(state, str) or state not in {'success', 'failure', 'error', 'pending'}:
            raise ValueError('invalid commit status context or state')
        if name not in most_recent:
            most_recent[name] = state
    return [
        {'name':name, 'status':'in_progress' if state=='pending' else 'completed',
         'conclusion':None if state=='pending' else ('success' if state=='success' else 'failure')}
        for name,state in most_recent.items()
    ]


def analyze_pr(repo, pull, checks, reviews, statuses=None):
    if not isinstance(checks, list) or any(not isinstance(item, dict) for item in checks):
        raise ValueError('invalid check-run record')
    head_ref = pull.get('head') if isinstance(pull, dict) else None
    head_sha = head_ref.get('sha') if isinstance(head_ref, dict) else None
    for check in checks:
        name = check.get('name')
        if not isinstance(name, str) or not name.strip():
            raise ValueError('invalid check-run name')
        check_sha = check.get('head_sha')
        if check_sha is not None and (
            not isinstance(check_sha, str) or not isinstance(head_sha, str)
            or check_sha.lower() != head_sha.lower()
        ):
            raise ValueError('check-run HEAD mismatch')
    if not isinstance(reviews, list) or any(not isinstance(item, dict) for item in reviews):
        raise ValueError('invalid review record')
    if any(review.get('user') is not None and not isinstance(review.get('user'), dict) for review in reviews):
        raise ValueError('invalid review user')
    # Important: a completed green check is not authoritative CI provenance.
    status_checks = latest_commit_status_checks(statuses or [])
    observed = list(checks) + status_checks
    # Duplicate check names may represent distinct push/PR suites; never collapse them.
    states = [str(x.get('status','')).lower() for x in observed]
    conclusions = [str(x.get('conclusion') or '').lower() for x in observed]
    failed_states = {'failure','timed_out','cancelled','action_required','startup_failure'}
    by_name = {}
    for check in observed:
        name = check.get('name')
        if isinstance(name,str) and name:
            by_name.setdefault(name,set()).add(str(check.get('conclusion') or '').lower())
    conflicting_names = sorted(name for name,states_for_name in by_name.items()
                               if 'success' in states_for_name and states_for_name & failed_states)
    if not observed:
        check_state = 'ABSENT'
    elif conflicting_names:
        check_state = 'CONFLICTING_CHECK_CONTEXT'
    elif any(v in failed_states for v in conclusions):
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
    identity_provenance_by_login = {}
    for review in reviews:
        user = (review.get('user') or {}).get('login')
        if user is not None and not isinstance(user, str):
            raise ValueError('invalid reviewer login')
        state = str(review.get('state') or '').upper()
        if user and state in {'APPROVED','CHANGES_REQUESTED','DISMISSED'}:
            submitted = review.get('submitted_at')
            if not isinstance(submitted, str):
                raise ValueError('invalid review submitted_at')
            try:
                when = datetime.fromisoformat(submitted.replace('Z', '+00:00'))
                if when.tzinfo is None or when.utcoffset() is None:
                    raise ValueError('missing timezone')
                when = when.astimezone(timezone.utc)
            except (ValueError, OverflowError, TypeError):
                raise ValueError('invalid review submitted_at') from None
            reviewer_id = (review.get('user') or {}).get('id')
            if reviewer_id is not None and (type(reviewer_id) is not int or reviewer_id <= 0):
                raise ValueError('invalid reviewer id')
            login_key = user.casefold()
            modes = identity_provenance_by_login.setdefault(login_key, set())
            modes.add(reviewer_id is not None)
            if len(modes) > 1:
                raise ValueError('ambiguous reviewer identity')
            key = ('id', reviewer_id) if reviewer_id is not None else ('login', login_key)
            current = newest_by_user.get(key)
            value = (state, review.get('commit_id'))
            if current is not None:
                old_when, old_value = current
                if when == old_when and value != old_value:
                    raise ValueError('ambiguous review ordering')
                if when <= old_when:
                    continue
            newest_by_user[key] = (when, value)
    base=(pull.get('base') or {}).get('ref')
    head=(pull.get('head') or {}).get('sha')
    reviewer_states = [entry[1] for entry in newest_by_user.values()]
    approved=sum(state=='APPROVED' and commit==head for state,commit in reviewer_states)
    stale_approvals=sum(state=='APPROVED' and commit!=head for state,commit in reviewer_states)
    changes=sum(state=='CHANGES_REQUESTED' for state,_ in reviewer_states)
    blockers=[]
    if pull.get('draft') is True:blockers.append('DRAFT')
    if base!='main':blockers.append('STACKED_BASE')
    if not head or len(head)!=40: blockers.append('HEAD_UNVERIFIED')
    if check_state=='ABSENT':blockers.append('NO_CHECK_RUNS')
    if check_state=='FAILED':blockers.append('FAILED_CHECK')
    if check_state=='CONFLICTING_CHECK_CONTEXT':blockers.append('CHECK_EVENT_PROVENANCE_UNVERIFIED')
    if check_state=='PENDING':blockers.append('PENDING_CHECK')
    if check_state in {'UNVERIFIED','NO_EXECUTED_PASS'}:blockers.append('INSUFFICIENT_CHECKS')
    if changes:blockers.append('CHANGES_REQUESTED')
    if stale_approvals:blockers.append('STALE_OR_UNBOUND_APPROVAL')
    if not approved:blockers.append('NO_HEAD_BOUND_APPROVAL_OBSERVED')
    blockers.append('PROVENANCE_UNVERIFIED')
    blockers.append('RULESET_AND_QUEUE_UNVERIFIED')
    return {
        'repo':repo,'number':pull.get('number'),'url':pull.get('html_url'),
        'head_sha':head,'base':base,'base_sha':(pull.get('base') or {}).get('sha'),
        'updated_at':pull.get('updated_at'),'draft':pull.get('draft'),
        'check_count':len(checks),'status_context_count':len(status_checks),
        'check_state':check_state,
        'conflicting_check_names':conflicting_names,
        'approvals':approved,'stale_or_unbound_approvals':stale_approvals,
        'changes_requested':changes,
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
        seen_repos=set()
        seen_prs=set()
        if not org or not all(c.isalnum() or c=='-' for c in org):
            raise ValueError('invalid organization name')
        for repo in pages(client,'/orgs/'+org+'/repos?type=all'):
            if not isinstance(repo, dict):
                raise ValueError('invalid repository record')
            full=repo.get('full_name')
            if not isinstance(full,str) or not full.casefold().startswith((org+'/').casefold()) or repo.get('archived'):
                continue
            repo_key=full.casefold()
            if repo_key in seen_repos:
                raise ValueError('duplicate repository in paginated response')
            seen_repos.add(repo_key)
            report['repos_scanned']+=1
            path='/repos/'+full
            for pull in pages(client,path+'/pulls?state=open'):
                if not isinstance(pull, dict):
                    raise ValueError('invalid pull request record')
                if report['count'] >= max_prs:
                    raise BudgetExceeded('PR scan cap reached: partial report')
                number=pull.get('number')
                head=pull.get('head')
                if not isinstance(head,dict):
                    raise ValueError('invalid PR head')
                sha=head.get('sha')
                if type(number) is not int or type(sha) is not str or len(sha)!=40 or any(c not in '0123456789abcdefABCDEF' for c in sha):
                    raise ValueError('invalid PR number or head sha')
                pr_key=(repo_key,number)
                if pr_key in seen_prs:
                    raise ValueError('duplicate PR in paginated response')
                seen_prs.add(pr_key)
                checks=list(pages(client,path+'/commits/'+sha+'/check-runs',key='check_runs'))
                statuses=list(pages(client,path+'/commits/'+sha+'/statuses'))
                reviews=list(pages(client,path+'/pulls/'+str(number)+'/reviews'))
                fresh=client.get(path+'/pulls/'+str(number))
                require_unchanged_pr_snapshot(pull,fresh)
                report['items'].append(analyze_pr(full,pull,checks,reviews,statuses))
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

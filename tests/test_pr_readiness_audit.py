import sys
import unittest
import io
import urllib.error
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from pr_readiness_audit import analyze_pr, audit_organization, BudgetExceeded, pages, require_unchanged_pr_snapshot


def pr(number=1, draft=False, base='main', head='a'*40):
    return {'number':number, 'draft':draft, 'head':{'sha':head},
            'base':{'ref':base,'sha':'b'*40}, 'updated_at':'2026-11-01T00:00:00Z',
            'html_url':f'https://github.com/RUMBO-IA/demo/pull/{number}'}

class FakeGitHub:
    def __init__(self, responses, limit=1000):
        self.responses=responses
        self.calls=[]
        self.limit=limit
    def get(self,path):
        if len(self.calls)>=self.limit:
            raise BudgetExceeded('request budget reached')
        self.calls.append(path)
        if path not in self.responses:
            raise AssertionError(f'unexpected request: {path}')
        return self.responses[path]

class TestReadiness(unittest.TestCase):
    def test_transient_502_retries_without_false_success(self):
        from pr_readiness_audit import GithubReader
        first = urllib.error.HTTPError('https://api.github.com/a', 502, 'Bad Gateway', {}, None)
        self.addCleanup(first.close)
        count = {'n': 0}
        def fake_open(request, timeout=15):
            count['n'] += 1
            if count['n'] == 1:
                raise first
            return io.BytesIO(b'{"ok":true}')
        reader = GithubReader('test-token', max_requests=2)
        with patch('urllib.request.urlopen', side_effect=fake_open):
            self.assertEqual(reader.get('/a'), {'ok': True})
        self.assertEqual(reader.count, 2)
        self.assertEqual(count['n'], 2)

    def test_transient_502_cannot_exceed_request_budget(self):
        from pr_readiness_audit import GithubReader
        first = urllib.error.HTTPError('https://api.github.com/a', 502, 'Bad Gateway', {}, None)
        self.addCleanup(first.close)
        reader = GithubReader('test-token', max_requests=1)
        with patch('urllib.request.urlopen', side_effect=first) as opened:
            with self.assertRaisesRegex(BudgetExceeded, 'request budget reached'):
                reader.get('/a')
        self.assertEqual(reader.count, 1)
        self.assertEqual(opened.call_count, 1)

    def test_green_checks_are_not_merge_authorization(self):
        res=analyze_pr('RUMBO-IA/demo',pr(),[{'name':'test','status':'completed','conclusion':'success'}],
                       [{'user':{'login':'reviewer'},'state':'APPROVED','submitted_at':'2026-11-01T01:00:00Z'}])
        self.assertFalse(res['merge_authorized'])
        self.assertEqual(res['check_state'],'GREEN_UNATTESTED')
        self.assertIn('PROVENANCE_UNVERIFIED',res['blockers'])
    def test_failed_duplicated_check_is_not_hidden_by_pass(self):
        res=analyze_pr('RUMBO-IA/demo',pr(),[
            {'name':'privacy','status':'completed','conclusion':'success'},
            {'name':'privacy','status':'completed','conclusion':'failure'}],[])
        self.assertEqual(res['check_state'],'CONFLICTING_CHECK_CONTEXT')
        self.assertIn('CHECK_EVENT_PROVENANCE_UNVERIFIED',res['blockers'])
    def test_latest_review_per_reviewer_wins(self):
        checks=[{'name':'unit','status':'completed','conclusion':'success'}]
        reviews=[{'user':{'login':'alice'},'state':'APPROVED','submitted_at':'2026-11-01T01:00:00Z'},
                 {'user':{'login':'alice'},'state':'CHANGES_REQUESTED','submitted_at':'2026-11-01T02:00:00Z'}]
        res=analyze_pr('RUMBO-IA/demo',pr(),checks,reviews)
        self.assertEqual(res['approvals'],0)
        self.assertEqual(res['changes_requested'],1)
    def test_stacked_draft_separate_blockers(self):
        res=analyze_pr('RUMBO-IA/demo',pr(draft=True,base='feature-parent'),[],[])
        self.assertIn('DRAFT',res['blockers'])
        self.assertIn('STACKED_BASE',res['blockers'])
        self.assertIn('NO_CHECK_RUNS',res['blockers'])
    def test_scan_org_pages_and_audits_exact_sha(self):
        repo={'full_name':'RUMBO-IA/demo','archived':False}
        paths={
            '/orgs/RUMBO-IA/repos?type=all&per_page=100&page=1':[repo],
            '/repos/RUMBO-IA/demo/pulls?state=open&per_page=100&page=1':[pr()],
            '/repos/RUMBO-IA/demo/commits/'+'a'*40+'/check-runs?per_page=100&page=1':{'check_runs':[], 'total_count':0},
            '/repos/RUMBO-IA/demo/pulls/1/reviews?per_page=100&page=1':[],
            '/repos/RUMBO-IA/demo/pulls/1':pr()}
        c=FakeGitHub(paths)
        report=audit_organization(c,'RUMBO-IA',max_prs=30)
        self.assertTrue(report['complete'])
        self.assertEqual(report['count'],1)
        self.assertEqual(report['items'][0]['head_sha'],'a'*40)
    def test_snapshot_detects_inflight_head_change(self):
        old=pr()
        new={**old,'head':{'sha':'c'*40}}
        with self.assertRaisesRegex(ValueError,'state changed during audit'):
            require_unchanged_pr_snapshot(old,new)
    def test_snapshot_detects_inflight_base_change(self):
        old=pr()
        new={**old,'base':{'ref':'feature-parent','sha':'b'*40}}
        with self.assertRaisesRegex(ValueError,'state changed during audit'):
            require_unchanged_pr_snapshot(old,new)
    def test_snapshot_detects_inflight_review_update(self):
        old=pr()
        new={**old,'updated_at':'2026-11-01T00:01:00Z'}
        with self.assertRaisesRegex(ValueError,'state changed during audit'):
            require_unchanged_pr_snapshot(old,new)
    def test_changed_head_report_fails_closed_without_stale_row(self):
        old=pr()
        repo={'full_name':'RUMBO-IA/demo','archived':False}
        responses={
            '/orgs/RUMBO-IA/repos?type=all&per_page=100&page=1':[repo],
            '/repos/RUMBO-IA/demo/pulls?state=open&per_page=100&page=1':[old],
            '/repos/RUMBO-IA/demo/commits/'+'a'*40+'/check-runs?per_page=100&page=1':{'check_runs':[]},
            '/repos/RUMBO-IA/demo/pulls/1/reviews?per_page=100&page=1':[],
            '/repos/RUMBO-IA/demo/pulls/1':{**old,'head':{'sha':'c'*40}},
        }
        report=audit_organization(FakeGitHub(responses),'RUMBO-IA',max_prs=30)
        self.assertFalse(report['complete'])
        self.assertEqual(report['count'],0)
        self.assertIn('state changed during audit',report['error'])
    def test_conflicting_check_names_are_provenance_unknown_not_merge_ready(self):
        pull=pr()
        checks=[{'name':'privacy','status':'completed','conclusion':'failure'},
                {'name':'privacy','status':'completed','conclusion':'success'}]
        row=analyze_pr('RUMBO-IA/demo',pull,checks,[])
        self.assertEqual(row['check_state'],'CONFLICTING_CHECK_CONTEXT')
        self.assertEqual(row['conflicting_check_names'],['privacy'])
        self.assertIn('CHECK_EVENT_PROVENANCE_UNVERIFIED',row['blockers'])
        self.assertFalse(row['merge_authorized'])
    def test_old_commit_approval_is_not_current_head_approval(self):
        reviews=[{'user':{'login':'alice'},'state':'APPROVED',
                  'submitted_at':'2026-11-01T02:00:00Z','commit_id':'c'*40}]
        row=analyze_pr('RUMBO-IA/demo',pr(head='a'*40),[],reviews)
        self.assertEqual(row['approvals'],0)
        self.assertEqual(row['stale_or_unbound_approvals'],1)
        self.assertIn('STALE_OR_UNBOUND_APPROVAL',row['blockers'])
    def test_missing_commit_binding_not_counted_as_approval(self):
        reviews=[{'user':{'login':'alice'},'state':'APPROVED',
                  'submitted_at':'2026-11-01T02:00:00Z'}]
        row=analyze_pr('RUMBO-IA/demo',pr(),[],reviews)
        self.assertEqual(row['approvals'],0)
        self.assertEqual(row['stale_or_unbound_approvals'],1)
    def test_matching_head_approval_observed_without_merge_authority(self):
        reviews=[{'user':{'login':'alice'},'state':'APPROVED',
                  'submitted_at':'2026-11-01T02:00:00Z','commit_id':'a'*40}]
        row=analyze_pr('RUMBO-IA/demo',pr(),[],reviews)
        self.assertEqual(row['approvals'],1)
        self.assertEqual(row['stale_or_unbound_approvals'],0)
        self.assertFalse(row['merge_authorized'])
    def test_pagination_does_not_drop_page_two(self):
        key='/repos/RUMBO-IA/demo/pulls?state=open'
        mock=FakeGitHub({key+'&per_page=100&page=1':[{'number':i} for i in range(100)],
                         key+'&per_page=100&page=2':[{'number':100}]})
        self.assertEqual(len(list(pages(mock,key))),101)
        self.assertEqual(len(mock.calls),2)
    def test_scan_cap_returns_partial_not_complete(self):
        repo={'full_name':'RUMBO-IA/demo','archived':False}
        checks='/repos/RUMBO-IA/demo/commits/'+'a'*40+'/check-runs?per_page=100&page=1'
        paths={'/orgs/RUMBO-IA/repos?type=all&per_page=100&page=1':[repo],
               '/repos/RUMBO-IA/demo/pulls?state=open&per_page=100&page=1':[pr(number=1),pr(number=2)],
               checks:{'check_runs':[], 'total_count':0},
               '/repos/RUMBO-IA/demo/pulls/1/reviews?per_page=100&page=1':[],
            '/repos/RUMBO-IA/demo/pulls/1':pr()}
        result=audit_organization(FakeGitHub(paths),'RUMBO-IA',max_prs=1)
        self.assertEqual(result['count'],1)
        self.assertFalse(result['complete'])
        self.assertIn('PR scan cap',result['error'])
    def test_budget_fails_closed_not_false_complete(self):
        repo={'full_name':'RUMBO-IA/demo','archived':False}
        c=FakeGitHub({'/orgs/RUMBO-IA/repos?type=all&per_page=100&page=1':[repo]},limit=1)
        report=audit_organization(c,'RUMBO-IA',max_prs=30)
        self.assertFalse(report['complete'])
        self.assertEqual(report['count'],0)
        self.assertEqual(report['error'],'request budget reached')

if __name__=='__main__': unittest.main()

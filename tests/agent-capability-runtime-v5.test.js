const assert=require('node:assert/strict');
const V5=require('../agent-capability-runtime-v5.js');
const Probe=require('../node-permission-probe-v5.js');

class FakeDispatcher{
  constructor(){this.calls=[];}
  listTools(){return [{name:'sendMessage',effect:'send'}];}
  async dispatch(request){
    this.calls.push(request);
    return {decision:'ALLOW',stage:'executed',executed:true,receipt:{tool:request.tool,authorizationId:'auth-test'}};
  }
}

function attestation(adapterId,nonce,overrides={}){
  return {
    adapterId,nonce,
    hardIsolation:true,
    networkIsolation:true,
    filesystemIsolation:true,
    processIsolation:true,
    hostProcessDenied:true,
    toolAccessMode:'mediated-only',
    proof:'verified-test-proof',
    ...overrides
  };
}

(async()=>{
  let passed=0;
  const ok=()=>{passed++;};

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const r=await runtime.dispatchProposal({tool:'sendMessage',action:{id:'a1'},input:{message:'hello'}});
    assert.equal(r.decision,'ALLOW');
    assert.equal(dispatcher.calls.length,1);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const r=await runtime.dispatchProposal({tool:'sendMessage',input:{escape:()=>process}});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'proposal_validation');assert.equal(dispatcher.calls.length,0);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const evil=Object.create({polluted:true});evil.message='x';
    const r=await runtime.dispatchProposal({tool:'sendMessage',input:evil});
    assert.equal(r.decision,'DENY');assert.match(r.reason,/non_plain_object/);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const sparse=new Array(2);sparse[1]='x';
    const r=await runtime.dispatchProposal({tool:'sendMessage',input:sparse});
    assert.equal(r.decision,'DENY');assert.match(r.reason,/sparse_or_decorated_array/);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const r=await runtime.runUntrustedCode({language:'javascript',code:'require("fs")'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'hard_sandbox_unavailable');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'attacker',attest:async({nonce})=>attestation('attacker',nonce),run:async()=>({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'untrusted_sandbox_adapter');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted']});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_attestation_verifier_missing');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async()=>attestation('trusted','wrong-nonce'),run:async()=>({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_isolation_requirements_not_met');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce,{networkIsolation:false}),run:async()=>({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_isolation_requirements_not_met');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>false});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_attestation_unverified');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    let sawHandler=false;
    const adapter={
      id:'trusted',
      attest:async({nonce})=>attestation('trusted',nonce),
      run:async({request,capabilities})=>{
        sawHandler='handler' in capabilities.tools[0];
        const toolResult=await capabilities.invokeTool({tool:'sendMessage',action:{id:'a2'},input:{message:request.message}});
        return {toolDecision:toolResult.decision,toolCount:capabilities.tools.length};
      }
    };
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async(a,{nonce})=>a.proof==='verified-test-proof'&&a.nonce===nonce});
    const r=await runtime.runUntrustedCode({message:'approved'});
    assert.equal(r.decision,'ALLOW');assert.equal(r.stage,'sandbox_completed');assert.equal(r.toolCalls.length,1);assert.equal(dispatcher.calls.length,1);assert.equal(sawHandler,false);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>({escape:()=>process})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'sandbox_result_validation');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>{throw new Error('sandbox died');}};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'sandbox_error');ok();
  }

  {
    const probe=Probe.runNodePermissionProbe();
    assert.equal(probe.available,true);
    assert.equal(probe.permissionModel,true);
    assert.equal(probe.fsDenied,true);
    assert.equal(probe.childDenied,true);
    assert.equal(probe.workerDenied,true);
    if(/^v22\./.test(process.version)){
      assert.equal(probe.networkDenied,false);
      assert.equal(probe.hardConfinement,false);
      assert.equal(probe.reason,'partial_confinement_only');
    }
    ok();
  }

  console.log(`RUMBO Agent Capability Runtime V5: ${passed}/${passed} PASS`);
})().catch(err=>{console.error(err);process.exitCode=1;});

const assert=require('node:assert/strict');
const V5=require('../agent-capability-runtime-v5.js');
const Probe=require('../node-permission-probe-v5.js');

class FakeDispatcher{
  constructor(){this.calls=[];}
  listTools(){return [{name:'sendMessage',effect:'send'}];}
  async dispatch(request){
    this.calls.push(request);
    return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'executed',executed:true,invocationAttempted:true,effectOutcome:'SUCCEEDED',receipt:{tool:request.tool,authorizationId:'auth-test'}};
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
    assert.equal(r.decision,'ALLOW');assert.equal(r.effectOutcome,'SUCCEEDED');assert.equal(dispatcher.calls.length,1);ok();
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
    let getterTouched=0;
    const input={};
    Object.defineProperty(input,'message',{enumerable:true,get(){getterTouched++;return 'secret';}});
    const r=await runtime.dispatchProposal({tool:'sendMessage',input});
    assert.equal(r.decision,'DENY');assert.match(r.reason,/accessor_property/);assert.equal(getterTouched,0);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const input={message:'x'};input[Symbol('escape')]='hidden';
    const r=await runtime.dispatchProposal({tool:'sendMessage',input});
    assert.equal(r.decision,'DENY');assert.match(r.reason,/symbol_property/);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    let deep={leaf:true};
    for(let i=0;i<70;i++) deep={next:deep};
    const r=await runtime.dispatchProposal({tool:'sendMessage',input:deep});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'proposal_validation');assert.match(r.reason,/value_too_deep/);assert.equal(dispatcher.calls.length,0);ok();
  }

  {
    assert.throws(()=>V5.parseJsonWire('x'.repeat(1024*1024+1),'oversize'),/oversize_too_large/);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const runtime=V5.createCapabilityRuntime({dispatcher});
    const r=await runtime.runUntrustedCode({language:'javascript',code:'require("fs")'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'hard_sandbox_unavailable');assert.equal(r.executionOutcome,'NOT_ATTEMPTED');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'attacker',attest:async({nonce})=>attestation('attacker',nonce),run:async()=>JSON.stringify({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'untrusted_sandbox_adapter');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>JSON.stringify({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted']});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_attestation_verifier_missing');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async()=>attestation('trusted','wrong-nonce'),run:async()=>JSON.stringify({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_isolation_requirements_not_met');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce,{networkIsolation:false}),run:async()=>JSON.stringify({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_isolation_requirements_not_met');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>JSON.stringify({ok:true})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>false});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.reason,'sandbox_attestation_unverified');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    let sawHandler=false;
    let wireOnly=false;
    const adapter={
      id:'trusted',
      attest:async({nonce})=>attestation('trusted',nonce),
      run:async({requestJson,capabilities})=>{
        const request=JSON.parse(requestJson);
        const tools=JSON.parse(capabilities.toolsJson);
        sawHandler=Boolean(tools[0]&&tools[0].handler);
        wireOnly=typeof capabilities.invokeToolJson==='function'&&!('invokeTool' in capabilities);
        const toolResult=JSON.parse(await capabilities.invokeToolJson(JSON.stringify({tool:'sendMessage',action:{id:'a2'},input:{message:request.message}})));
        return JSON.stringify({toolDecision:toolResult.decision,toolOutcome:toolResult.effectOutcome,toolCount:tools.length});
      }
    };
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async(a,{nonce})=>a.proof==='verified-test-proof'&&a.nonce===nonce});
    const r=await runtime.runUntrustedCode({message:'approved'});
    assert.equal(r.decision,'ALLOW');assert.equal(r.stage,'sandbox_completed');assert.equal(r.executionOutcome,'COMPLETED');assert.equal(r.result.toolOutcome,'SUCCEEDED');assert.equal(r.toolCalls.length,1);assert.equal(r.toolCalls[0].effectOutcome,'SUCCEEDED');assert.equal(dispatcher.calls.length,1);assert.equal(sawHandler,false);assert.equal(wireOnly,true);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={
      id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),
      run:async({capabilities})=>{
        const denied=JSON.parse(await capabilities.invokeToolJson({tool:'sendMessage'}));
        return JSON.stringify({wireDecision:denied.decision,wireStage:denied.stage});
      }
    };
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'ALLOW');assert.equal(r.result.wireDecision,'DENY');assert.equal(r.result.wireStage,'tool_wire_validation');assert.equal(dispatcher.calls.length,0);ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>({escape:'host-object'})};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'sandbox_result_validation');assert.equal(r.reason,'sandbox_result_not_string');assert.equal(r.executionOutcome,'FAILED_OR_UNKNOWN');ok();
  }

  {
    const dispatcher=new FakeDispatcher();
    const adapter={id:'trusted',attest:async({nonce})=>attestation('trusted',nonce),run:async()=>{throw new Error('sandbox died');}};
    const runtime=V5.createCapabilityRuntime({dispatcher,sandboxAdapter:adapter,trustedSandboxAdapterIds:['trusted'],verifySandboxAttestation:async()=>true});
    const r=await runtime.runUntrustedCode({code:'1'});
    assert.equal(r.decision,'DENY');assert.equal(r.stage,'sandbox_error');assert.equal(r.executionOutcome,'FAILED_OR_UNKNOWN');ok();
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

  assert.equal(passed,19);
  console.log('RUMBO Agent Capability Runtime V5/V6 hardening: 19/19 PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});

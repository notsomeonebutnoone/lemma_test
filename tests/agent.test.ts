import test from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { Store } from '../lib/commander/store';
import { sandboxPorts } from '../lib/commander/sandbox';
import { diagnose } from '../lib/commander/agent';
import { rollbackPolicy } from '../lib/commander/policy';
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };
for (const unsafe of [false, true]) test('real AI SDK loop persists tools/output/usage; unsafe=' + unsafe, async () => {
  const store = new Store(':memory:');
  try {
    const run = store.enqueue({ eventKey: 'model-test', mode: 'sandbox', scenario: unsafe ? 'unsafe-migration' : 'checkout-regression', title: 'Model test' });
    const input = await sandboxPorts(run, store, true).investigate();
    const model = new MockLanguageModelV4({ doGenerate: [
      { content: [{ type: 'tool-call', toolCallId: 'call1', toolName: 'inspectDeployment', input: '{}' }], finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [] },
      { content: [{ type: 'tool-call', toolCallId: 'call2', toolName: 'inspectGitChange', input: '{}' }], finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [] },
      { content: [{ type: 'text', text: JSON.stringify({ hypothesis: 'The changed parser rejects the missing optional promo code.', confidence: .97, recommendation: 'rollback', citations: [input.current.sha] }) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] },
    ] });
    const result = await diagnose(input, run.id, store, 'mock-provider', model);
    assert.equal(model.doGenerateCalls.length, 3); assert.deepEqual(result.toolCalls, ['inspectDeployment', 'inspectGitChange']); assert.equal(result.inputTokens, 30); assert.equal(result.outputTokens, 60); assert.equal(result.costUsd, null);
    const saved = store.generations(run.id)[0]; assert.equal(saved.status, 'complete'); assert.equal(saved.generationId, result.generationId); assert.equal(rollbackPolicy(input, result, ['demo-target/']).allowed, !unsafe);
    const prompt = JSON.stringify(model.doGenerateCalls[2].prompt); assert.ok(prompt.includes(input.current.sha)); assert.ok(prompt.includes(input.changes.files[0].filename));
  } finally { store.close(); }
});
test('model returning an answer without evidence tools is rejected and failure persisted', async () => {
  const store = new Store(':memory:');
  try {
    const run = store.enqueue({ eventKey: 'invalid-model', mode: 'sandbox', scenario: 'checkout-regression', title: 'Invalid model' }); const input = await sandboxPorts(run, store, true).investigate();
    const model = new MockLanguageModelV4({ doGenerate: { content: [{ type: 'text', text: JSON.stringify({ hypothesis: 'Trust me, rollback regardless of the missing evidence.', confidence: 1, recommendation: 'rollback', citations: [input.current.sha] }) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] } });
    await assert.rejects(() => diagnose(input, run.id, store, 'mock-provider', model), /No automatic rollback/); assert.equal(store.generations(run.id)[0].status, 'failed');
  } finally { store.close(); }
});

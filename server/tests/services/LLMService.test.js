jest.mock('axios');
const axios = require('axios');
const LLMService = require('../../src/services/LLMService');

const buildService = (options = {}) =>
  new LLMService({
    baseUrl: 'http://llm.local/v1',
    apiKey: 'test-key',
    model: 'test-model',
    ...options
  });

const mockCompletion = (content) => {
  axios.post.mockResolvedValue({
    data: { choices: [{ message: { content } }] }
  });
};

describe('LLMService', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('is disabled without a base URL or model and returns the fallback untouched', async () => {
    const noUrl = buildService({ baseUrl: '' });
    const noModel = buildService({ model: '' });

    expect(noUrl.isEnabled()).toBe(false);
    expect(noModel.isEnabled()).toBe(false);

    const result = await noUrl.rewrite({ intent: 'test', fallback: 'plain message' });
    expect(result).toBe('plain message');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('returns the LLM reply when it passes validation', async () => {
    const service = buildService();
    mockCompletion('@viewer your video made the cut. Try to look surprised.');

    const result = await service.rewrite({
      intent: 'video added',
      mustInclude: ['@viewer'],
      fallback: 'fallback'
    });

    expect(result).toBe('@viewer your video made the cut. Try to look surprised.');
  });

  test('posts to the chat completions endpoint with auth and prompt content', async () => {
    const service = buildService();
    mockCompletion('@viewer done.');

    await service.rewrite({
      intent: 'the situation',
      facts: { videoTitle: 'Cool Video' },
      mustInclude: ['@viewer'],
      fallback: 'fallback'
    });

    const [endpoint, body, config] = axios.post.mock.calls[0];
    expect(endpoint).toBe('http://llm.local/v1/chat/completions');
    expect(body.model).toBe('test-model');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('the situation');
    expect(body.messages[1].content).toContain('videoTitle: Cool Video');
    expect(body.messages[1].content).toContain('@viewer');
    expect(config.headers.Authorization).toBe('Bearer test-key');
    expect(config.timeout).toBe(8000);
  });

  test('omits the Authorization header without an api key', async () => {
    const service = buildService({ apiKey: '' });
    mockCompletion('reply');

    await service.rewrite({ intent: 'test', fallback: 'fallback' });

    const [, , config] = axios.post.mock.calls[0];
    expect(config.headers.Authorization).toBeUndefined();
  });

  test('falls back when the request fails', async () => {
    const service = buildService();
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await service.rewrite({ intent: 'test', fallback: 'safe words' });
    expect(result).toBe('safe words');
  });

  test('falls back when required content is missing from the reply', async () => {
    const service = buildService();
    mockCompletion('a reply that forgot to mention anyone');

    const result = await service.rewrite({
      intent: 'test',
      mustInclude: ['@viewer', 'https://example.com/x'],
      fallback: 'fallback with @viewer'
    });

    expect(result).toBe('fallback with @viewer');
  });

  test('falls back when the reply is empty or too long', async () => {
    const service = buildService();

    mockCompletion('   ');
    expect(await service.rewrite({ intent: 'test', fallback: 'fb' })).toBe('fb');

    mockCompletion('x'.repeat(600));
    expect(await service.rewrite({ intent: 'test', fallback: 'fb' })).toBe('fb');
  });

  test('sanitizes newlines, think blocks, and wrapping quotes', async () => {
    const service = buildService();
    mockCompletion('<think>hmm the viewer wants snark</think>\n"line one\nline two"\n');

    const result = await service.rewrite({ intent: 'test', fallback: 'fb' });
    expect(result).toBe('line one line two');
  });
});

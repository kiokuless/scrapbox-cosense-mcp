import { handleDeleteLines } from '@/routes/handlers/delete-lines.js';

jest.mock('@cosense/std/websocket', () => ({
  patch: jest.fn()
}));

let mockedPatch: jest.MockedFunction<typeof import('@cosense/std/websocket').patch>;
beforeAll(async () => {
  const websocketModule = await import('@cosense/std/websocket');
  mockedPatch = websocketModule.patch as jest.MockedFunction<typeof import('@cosense/std/websocket').patch>;
});

describe('handleDeleteLines', () => {
  const mockProjectName = 'test-project';
  const mockCosenseSid = 'test-sid';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('エラーケース', () => {
    it('COSENSE_SIDが未設定の場合にエラーを返す', async () => {
      const result = await handleDeleteLines(mockProjectName, undefined, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
      });

      expect(result).toEqual({
        content: [{
          type: "text",
          text: expect.stringContaining('Authentication required')
        }],
        isError: true
      });
      expect(mockedPatch).not.toHaveBeenCalled();
    });

    it('deleteCountが正の整数でない場合にエラーを返す', async () => {
      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
        deleteCount: 0,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('deleteCount must be a positive integer');
      expect(mockedPatch).not.toHaveBeenCalled();
    });

    it('対象行が見つからない場合にエラーを返し、行を変更しない', async () => {
      let capturedResult: any[] = [];
      const mockLines = [
        { text: 'Test Page', id: 'l1' },
        { text: 'some line', id: 'l2' },
      ] as any;
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        capturedResult = updateFn(mockLines) as any[];
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'missing line',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Target line not found');
      expect(capturedResult).toBe(mockLines);
    });

    it('タイトル行を削除しようとした場合にエラーを返し、行を変更しない', async () => {
      let capturedResult: any[] = [];
      const mockLines = [
        { text: 'Test Page', id: 'l1' },
        { text: 'body line', id: 'l2' },
      ] as any;
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        capturedResult = updateFn(mockLines) as any[];
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'Test Page',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Cannot delete the page title line');
      expect(capturedResult).toBe(mockLines);
    });
  });

  describe('正常ケース', () => {
    it('完全一致した最初の1行を削除する', async () => {
      let capturedResult: any[] = [];
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        const mockLines = [
          { text: 'Test Page', id: 'l1' },
          { text: 'target line', id: 'l2' },
          { text: 'next line', id: 'l3' },
        ] as any;
        capturedResult = updateFn(mockLines) as any[];
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
      });

      expect(result.content[0]?.text).toContain('Successfully deleted lines from page');
      expect(result.content[0]?.text).toContain('Deleted lines: 1');
      expect(capturedResult.map(line => line.text)).toEqual(['Test Page', 'next line']);
      expect(mockedPatch).toHaveBeenCalledWith(
        mockProjectName,
        'Test Page',
        expect.any(Function),
        { sid: mockCosenseSid }
      );
    });

    it('deleteCountで複数行を削除する', async () => {
      let capturedResult: any[] = [];
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        const mockLines = [
          { text: 'Test Page', id: 'l1' },
          { text: 'start', id: 'l2' },
          { text: 'remove me too', id: 'l3' },
          { text: 'keep', id: 'l4' },
        ] as any;
        capturedResult = updateFn(mockLines) as any[];
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'start',
        deleteCount: 2,
      });

      expect(result.content[0]?.text).toContain('Deleted lines: 2');
      expect(capturedResult.map(line => line.text)).toEqual(['Test Page', 'keep']);
    });

    it('deleteCountが残り行数を超える場合は存在する行だけ削除する', async () => {
      let capturedResult: any[] = [];
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        const mockLines = [
          { text: 'Test Page', id: 'l1' },
          { text: 'start', id: 'l2' },
          { text: 'last', id: 'l3' },
        ] as any;
        capturedResult = updateFn(mockLines) as any[];
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'start',
        deleteCount: 10,
      });

      expect(result.content[0]?.text).toContain('Deleted lines: 2');
      expect(capturedResult.map(line => line.text)).toEqual(['Test Page']);
    });

    it('部分一致では削除しない', async () => {
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        const mockLines = [
          { text: 'Test Page', id: 'l1' },
          { text: 'my TODO list', id: 'l2' },
          { text: 'other line', id: 'l3' },
        ] as any;
        updateFn(mockLines);
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'TODO',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Target line not found');
    });

    it('compact出力を返す', async () => {
      mockedPatch.mockImplementation(async (_project, _title, updateFn) => {
        updateFn([
          { text: 'Test Page', id: 'l1' },
          { text: 'target line', id: 'l2' },
        ] as any);
        return { ok: true, val: 'commitId', err: null };
      });

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
        compact: true,
      });

      expect(result.content[0]?.text).toBe('deleted: 1 lines from Test Page');
    });

    it('patchがResult.Errを返した場合にエラーレスポンスを返す', async () => {
      mockedPatch.mockResolvedValue({ ok: false, val: null, err: 'DisconnectReason' } as any);

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('WebSocket patch failed');
    });

    it('WebSocket APIでエラーが発生した場合にエラーレスポンスを返す', async () => {
      mockedPatch.mockRejectedValue(new Error('WebSocket error'));

      const result = await handleDeleteLines(mockProjectName, mockCosenseSid, {
        pageTitle: 'Test Page',
        targetLineText: 'target line',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('WebSocket error');
    });
  });
});

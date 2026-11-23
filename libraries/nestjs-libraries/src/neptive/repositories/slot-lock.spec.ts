import { NeptiveSlotLock } from './slot-lock';

function fakeClient() {
  const calls: string[] = [];
  const executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(`${strings.join('?')}|${values.join(',')}`);
    return 0;
  });
  const client = {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>, options: any) => {
      calls.push(`tx timeout=${options?.timeout}`);
      return fn({ $executeRaw: executeRaw });
    }),
  };
  return { client, calls, executeRaw };
}

describe('NeptiveSlotLock', () => {
  it('takes one transaction-scoped advisory lock per slot, in sorted order, then runs the work', async () => {
    const { client, calls, executeRaw } = fakeClient();
    const lock = new NeptiveSlotLock(() => client as any);
    const order: string[] = [];
    executeRaw.mockImplementation(async (_s: any, ...values: unknown[]) => {
      order.push(`lock ${values[1]}`);
      return 0;
    });
    const result = await lock.run(['item-b', 'item-a', 'item-b', ''], async () => {
      order.push('work');
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(['lock neptive-slot:item-a', 'lock neptive-slot:item-b', 'work']);
    expect(String(executeRaw.mock.calls[0][0].join('?'))).toContain('pg_advisory_xact_lock');
    expect(calls[0]).toMatch(/^tx timeout=\d+/);
  });

  it('no slot: runs the work without a transaction', async () => {
    const { client } = fakeClient();
    const lock = new NeptiveSlotLock(() => client as any);
    await expect(lock.run([], async () => 'ok')).resolves.toBe('ok');
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('the work failing propagates its own error', async () => {
    const { client } = fakeClient();
    const lock = new NeptiveSlotLock(() => client as any);
    await expect(
      lock.run(['item-a'], async () => {
        throw new Error('slot already confirmed');
      })
    ).rejects.toThrow('slot already confirmed');
  });

  it('cannot take the lock: fails before doing any work (fail closed)', async () => {
    const { client, executeRaw } = fakeClient();
    executeRaw.mockRejectedValue(new Error('database down'));
    const lock = new NeptiveSlotLock(() => client as any);
    const work = jest.fn();
    await expect(lock.run(['item-a'], work)).rejects.toThrow('database down');
    expect(work).not.toHaveBeenCalled();
  });

  it('the lock transaction failing AFTER the work finished does not turn a done job into an error', async () => {
    const lock = new NeptiveSlotLock(
      () =>
        ({
          $transaction: async (fn: any) => {
            await fn({ $executeRaw: async () => 0 });
            throw new Error('Transaction already closed');
          },
        }) as any
    );
    await expect(lock.run(['item-a'], async () => 'committed')).resolves.toBe('committed');
  });
});

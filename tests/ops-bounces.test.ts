import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBounce } from '../scripts/ops/lib/leads';

const ndr = (to: string) => ({
  from: 'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@calgarywatch.ca',
  subject: 'Undeliverable: Re: Your Dalhousie Harvest Market listing on CalgaryWatch',
  text: `Delivery has failed to these recipients or groups:\n\n${to}<mailto:${to}>\nYour message wasn't delivered. Please try resending the message.\n\nDiagnostic information for administrators:\n\nGenerating server: YT6PR01MB822961.CANPRD01.PROD.OUTLOOK.COM\n\n${to}\nRemote server returned '550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP. For more information please go to http://go.microsoft.com/fwlink/?LinkId=526653 AS(7230)'\n\nOriginal message headers:\n\nFrom: aldo@calgarywatch.ca\nTo: ${to}\n`,
});

describe('bounced mail', () => {
  it("reads Microsoft's delivery-failure notice: who, and why", () => {
    const b = parseBounce(ndr('Marcom@DalhousieCalgary.ca'));
    assert.deepEqual(b?.recipients, ['marcom@dalhousiecalgary.ca']);
    assert.equal(b?.reason, '5.7.708 Service unavailable. Access denied, traffic not accepted from this IP.');
  });
  it('ignores ordinary replies, even ones that mention a failure', () => {
    assert.equal(parseBounce({ from: 'kim@albertaballet.com', subject: 'Undeliverable: your email', text: 'Delivery has failed to these recipients: x@y.ca' }), null);
    assert.equal(parseBounce({ from: 'postmaster@calgarywatch.ca', subject: 'Weekly report', text: 'hello a@b.ca' }), null);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeAgo } from "../src/components/admin/ui";
import { adminTimestamp } from "../src/lib/adminRecord";
import {
  normalizeAdminInventoryRow,
  matchesAdminInventory,
} from "../src/lib/adminInventory";
import {
  adminClaim,
  adminSubmissionInput,
} from "../src/lib/adminContentRecords";
test("shared time labels render Firestore, ISO, numeric and malformed dates without crashing", () => {
  const ms = Date.now() - 1000;
  for (const raw of [
    ms,
    new Date(ms).toISOString(),
    { seconds: ms / 1000 },
    { toMillis: () => ms },
  ]) {
    assert.equal(adminTimestamp(raw), ms);
    assert.match(
      renderToStaticMarkup(React.createElement(TimeAgo, { ts: raw })),
      /<time/,
    );
  }
  for (const raw of [
    null,
    undefined,
    {},
    NaN,
    Infinity,
    "not a date",
    {
      toMillis() {
        throw Error("bad");
      },
    },
  ])
    assert.doesNotThrow(() =>
      renderToStaticMarkup(React.createElement(TimeAgo, { ts: raw })),
    );
});
test("incomplete backend inventory remains searchable without enabling unsupported moderation", () => {
  const row = normalizeAdminInventoryRow(
    {
      title: "Legacy market",
      status: "pending",
      verifiedAt: { seconds: 1 },
      duplicateIds: "bad",
    },
    "canonical-id",
    "market",
  );
  assert.equal(row.id, "canonical-id");
  assert.deepEqual(row.sources, []);
  assert.deepEqual(row.duplicateIds, []);
  assert.equal(row.verifiedAt, "1970-01-01T00:00:01.000Z");
  assert.ok(row.moderationUnavailable);
  assert.ok(matchesAdminInventory(row, "legacy market"));
  const complete = normalizeAdminInventoryRow(
    {
      title: "Current",
      status: "pending",
      revision: 2,
      sources: [null, { name: {}, url: "https://example.org" }],
    },
    "good",
    "event",
  );
  assert.equal(complete.moderationUnavailable, false);
  assert.equal(complete.sources[0].name, "Official source");
});
test("claim timestamps normalize for presentation while missing identity never gains approval access", () => {
  assert.equal(adminClaim({ entityId: "event", status: "pending" }), undefined);
  const claim = adminClaim({
    uid: "owner",
    entityId: "event",
    status: "approved",
    createdAt: { seconds: 1 },
    reviewedAt: { seconds: 2 },
    workEmail: { legacy: true },
    note: { legacy: true },
    approvedOrganizationId: {},
  })!;
  assert.equal(claim.uid, "owner");
  assert.equal(claim.createdAt, 1000);
  assert.equal(claim.reviewedAt, 2000);
  assert.equal(claim.workEmail, "");
  assert.equal(claim.note, "");
  assert.equal(claim.approvedOrganizationId, undefined);
});
test("submission adapters keep repairable fields and reject unsupported kinds", () => {
  assert.equal(adminSubmissionInput(null), undefined);
  assert.equal(adminSubmissionInput({ kind: "business" }), undefined);
  const event = adminSubmissionInput({
    kind: "event",
    title: "Fix dates",
    start: {},
    categories: "old value",
  })!;
  assert.equal(event.title, "Fix dates");
  assert.deepEqual(event.categories, []);
  assert.ok(event.kind === "event" && event.start === "");
  const market = adminSubmissionInput({
    kind: "market",
    occurrences: [null, { sourceRecordId: "date", start: "bad" }],
    amenities: "bad",
  })!;
  assert.ok(market.kind === "market" && market.occurrences.length === 2);
  assert.ok(market.kind === "market" && market.amenities.length === 0);
});

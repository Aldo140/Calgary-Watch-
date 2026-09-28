# Reposts (with permission only)

Videos from other creators that @calgarydaily shares, each one only after the
creator said yes. Credit alone is not permission.

1. Find a clip in the Instagram app (Explore, #yyc, #calgary, local accounts).
2. DM the creator (template below). Wait for a clear yes.
3. Save the video they send (or your copy, made after they agreed) here as
   `brand/reposts/<handle>-<short-name>.mp4` (under 19 MB).
4. Add a draft to `brand/drafts/` with `"kind": "repost"` and a `repost` block:
   handle, originalUrl, video, and permission {grantedBy, how, date, quote}.
   The caption must include `@handle` and the words "with permission".
   The daily job refuses to queue anything missing these (see `repostProblems`
   in `scripts/ops/jobs/drafts.ts`).
5. Approve it in /admin like any other post.

If a creator later asks us to take it down, delete the post in Instagram and
add `"withdrawn": true` to the draft.

## DM template

> Hi! This is so good. I run @calgarydaily (Calgary events and news, about
> 4,300 followers). Would you be okay with us sharing this clip as a Reel,
> with you credited and tagged in the caption and on the video? Happy to take
> it down any time you ask. Thanks either way!

## Example draft

```json
{
  "id": "elk-on-the-path",
  "kind": "repost",
  "title": "Elk on the Bow River pathway",
  "suggestedAt": "2026-10-02T12:00",
  "approved": false,
  "repost": {
    "handle": "someone.yyc",
    "originalUrl": "https://www.instagram.com/reel/XXXXXXXX/",
    "video": "brand/reposts/someone-yyc-elk.mp4",
    "permission": { "grantedBy": "@someone.yyc", "how": "Instagram DM", "date": "2026-10-01", "quote": "Yes go for it, just tag me!" }
  },
  "slides": [{ "template": "news", "eyebrow": "SEEN IN CALGARY", "headline": "Elk on the Bow River pathway.", "details": ["Video: @someone.yyc"], "footer": "Shared with permission" }],
  "caption": "Just a regular Tuesday on the Bow River pathway.\n\n🎥 @someone.yyc, shared with permission.\n\n#yyc #calgary #calgarydaily",
  "altText": "Video of an elk walking along the Bow River pathway in Calgary.",
  "sources": [{ "name": "Original post by @someone.yyc", "url": "https://www.instagram.com/reel/XXXXXXXX/" }]
}
```

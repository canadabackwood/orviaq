# Orvia social publishing setup

Orvia 1.1.0 wires one publishing connection surface for X, YouTube, Instagram, Facebook Pages, TikTok, LinkedIn, Threads and Pinterest.

## Callback URLs

Local development (the default):

- X: `http://127.0.0.1:3000/api/publishing/x/connect`
- YouTube: `http://127.0.0.1:3000/api/publishing/youtube/callback`
- Meta (Instagram + Facebook Pages): `http://127.0.0.1:3000/api/publishing/meta/callback`
- TikTok: `http://127.0.0.1:3000/api/publishing/tiktok/callback`
- LinkedIn: `http://127.0.0.1:3000/api/publishing/linkedin/callback`
- Threads: `http://127.0.0.1:3000/api/publishing/threads/callback`
- Pinterest: `http://127.0.0.1:3000/api/publishing/pinterest/callback`

Production: set `ORVIA_PUBLIC_URL` to the exact HTTPS origin, for example `https://pro3.cloud`, and register the corresponding callback URLs in each provider console. The callback URI used at runtime must exactly match the registered URI.

## What each connection does

### X
OAuth 2.0 Authorization Code + PKCE. The `/connect` endpoint is intentionally both the start endpoint and the callback because that is the URI registered in the X app. The server detects `code` + `state` and performs the token exchange instead of starting OAuth again.

Default scopes:
`tweet.read tweet.write users.read offline.access`

Publishing:
- text
- multi-post threads
- X metrics lookup

### YouTube
Google OAuth 2.0 with offline access and PKCE.

Default scopes:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`

Publishing:
- video upload
- privacy status

### Instagram + Facebook Pages
One Meta OAuth connection supplies the Facebook Page tokens and Instagram Professional account association.

Publishing:
- Instagram image
- Instagram Reel/video
- Facebook Page text/link posts

A connected Meta account must have the required Page/Instagram permissions and an eligible Instagram Professional account.

### TikTok
TikTok Content Posting API.

Default scopes:
- `user.info.basic`
- `video.publish`
- `video.upload`

Publishing:
- direct video
- direct photo posts
- creator-info-aware privacy selection

TikTok may require product enablement, `video.publish` approval and app audit before public direct posting is available. Unaudited clients can be restricted to private visibility.

### LinkedIn
LinkedIn OAuth 2.0 member authorization.

Default scopes:
- `openid`
- `profile`
- `w_member_social`

Publishing:
- member text posts

Organization publishing needs the appropriate LinkedIn organization permissions and a separate implementation path.

### Threads
Threads OAuth.

Default scopes:
- `threads_basic`
- `threads_content_publish`

Publishing:
- text posts

### Pinterest
Pinterest OAuth 2.0.

Default scopes:
- `boards:read`
- `boards:write`
- `pins:read`
- `pins:write`

Publishing:
- image Pins
- board discovery
- automatic use of the first available board when no board is selected

Orvia refreshes Pinterest access tokens using the continuous refresh-token flow when the access token is near expiry.

## Security

Provider client secrets and user access/refresh tokens are encrypted at rest by Orvia. Never put access tokens in source code or commit `.env`.

The Publishing Accounts screen is the normal user-facing connection surface. Advanced is only for developer application credentials.


## Current provider requirements

- Google/YouTube: the callback URI must be registered exactly as the value shown in Settings → Advanced. `localhost` and `127.0.0.1` are different URIs.
- TikTok: current Login Kit uses `https://www.tiktok.com/v2/auth/authorize/` for web and requires the registered redirect URI plus the approved scopes. The baseline connection scope is `user.info.basic`; Content Posting scopes must be enabled/approved in the TikTok app before requesting them.
- Pinterest: the redirect URI must exactly match one registered in the Pinterest app.
- Meta: do not mix Instagram Login permissions with Facebook Login permissions. For the current Meta provider implementation (Facebook Login + Page-linked Instagram), request `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, and `instagram_content_publish`. If you instead build the separate Instagram Login flow, use the `instagram_business_*` permissions and the Instagram Login flow.

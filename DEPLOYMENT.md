# Deployment

The HTML, CSS, and JavaScript are served by GitHub Pages at
`https://velox-world.com`. Images and videos are served by Cloudflare R2 at
`https://media.velox-world.com`.

## 1. Create and configure the R2 bucket

1. Create an R2 bucket, for example `velox-world-media`.
2. In the bucket's **Settings → Custom Domains**, connect
   `media.velox-world.com` and wait for the status to become **Active**.
3. Add the policy from `cloudflare-r2-cors.json` under **Settings → CORS**.
4. Create an R2 API token with **Object Read & Write** access to this bucket.
5. Configure a local `rclone` S3 remote using Cloudflare's endpoint and that
   token, then upload the media:

   ```sh
   rclone config
   ./scripts/upload-media.sh r2:velox-world-media
   ```

The upload keeps the existing paths, such as
`velox/videos/clip_01.mp4` and `rpo/sd3.5/base/0000.png`.

## 2. Configure GitHub Pages

1. In `florinshen/velox-world.com`, open **Settings → Pages**.
2. Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Set the custom domain to `velox-world.com`.
4. After the certificate is ready, enable **Enforce HTTPS**.

The repository's `CNAME` file preserves the custom domain across deployments.

## 3. Configure Cloudflare DNS

Create these DNS records for GitHub Pages. Keep the R2-generated
`media` record unchanged.

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `florinshen.github.io` |

Use **DNS only** for the GitHub Pages records until GitHub has provisioned its
HTTPS certificate. GitHub will redirect `www.velox-world.com` to the apex domain.

## 4. Verify

```sh
curl -I https://media.velox-world.com/velox/videos/thumbs/clip_01.jpg
curl -I https://media.velox-world.com/velox/videos/clip_01.mp4
curl -I https://velox-world.com/
```

For the MP4 request, confirm that byte-range requests work (`Accept-Ranges` or
a successful `206 Partial Content` response). Then check the home page and both
interactive galleries in a browser.

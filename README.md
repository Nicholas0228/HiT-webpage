# HiT webpage

This repository is the shared source for the HiT project page.
Make page edits here. The complete static site is in `dist/`.
Read `AGENTS.md` for the design rules before you edit the page.

## Local preview

Run this command from the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8765/> on the same computer. Refresh the page after
you change a file. No build or package installation is needed.

If the server runs on a remote computer, open an SSH tunnel from your laptop:

```bash
ssh -N -L 8765:127.0.0.1:8765 YOUR_SSH_HOST
```

Replace `YOUR_SSH_HOST` with the SSH connection for the computer that runs the
preview. Then open <http://127.0.0.1:8765/> on your laptop. The server listens
only on the remote computer's loopback address.

## Shared work and publication

Pull the latest changes before you edit. Use a separate branch for each change
and open a pull request for review. Keep source changes in this repository.

The public page is at <https://nicholas0228.github.io/HiT-webpage/>.
The blog address <https://nicholas0228.github.io/blog/hit/> redirects to it.

Every push or pull request merge into `main` runs `.github/workflows/pages.yml`
and publishes `dist/` through GitHub Pages. The workflow can also be run manually
from the Actions tab. Wait for the deployment to finish before checking changes
on the public page.

Keep all page content, styles, scripts, and assets here. The homepage repository
contains only the blog entry and redirect; it does not hold a second copy of the
HiT page. Changes on a feature branch stay unpublished until merged into `main`.

## Original source

Copied from [WeihangGuo/HiT-webpage](https://github.com/WeihangGuo/HiT-webpage)
at commit `ecb5e1f8087d26eb4aae86bd9b87b9692fd85423`.
The original history, author names, and page assets are preserved.

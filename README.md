# HiT webpage

This private repository is the shared source for the HiT project page.
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

GitHub Pages and Actions are currently disabled for this repository. The
existing Pages workflow is preserved for later use. Public publication needs
a separate request. A future deployment can use `dist/` from this repository,
with a link from the homepage or blog.

## Original source

Copied from [WeihangGuo/HiT-webpage](https://github.com/WeihangGuo/HiT-webpage)
at commit `ecb5e1f8087d26eb4aae86bd9b87b9692fd85423`.
The original history, author names, and page assets are preserved.

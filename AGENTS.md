# Agent guidance

For user requests to install, configure, update, or verify these DSH plugins, read [AI-INSTALL.md](AI-INSTALL.md) first and follow its environment detection, consent, safe credential handling, installation, and verification checklist. This repository contains three independent bundles under `plugins/`, not a root bundle.

Do not assume `web` is the target profile, assume a universal credentials UI exists, or assume an Agent shell's environment is visible to the running DSH Host. Do not claim compatibility with every DSH version. Current declared compatibility is DSH 0.2.1-alpha.1 and Node >=22.

Never read/copy user authentication files, print secrets, override approval policies, silently switch DiDi to production, or test installation by creating/cancelling rides, adding food to cart, or changing meetings. Preserve user changes and unrelated profile configuration. Ask the user before restarting their active DSH process.

Report installation, activation, credential configuration, read-only connectivity, and remaining manual steps separately. When permissions, versions, safe credential input, or browser login prevent completion, state the concrete missing prerequisite rather than claiming success.

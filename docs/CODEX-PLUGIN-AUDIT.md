# Codex plugin audit — 2026-11-04

Read-only evidence: `codex plugin list --json` on codex-cli 0.166.0. Found **45 installed /45 enabled**. This is installation state, not a claim of authenticated provider access. The live host tool metadata was separately reviewed for35 scoped read-only tool identities and one native web tool. Skill-only plugins remain usable through their required host skill/runtime, without fabricating a direct MCP tool.

Full personal raw CLI output and host snapshot remain under ignored `.nyxskill/`; credentials, config, local install paths and full metadata are excluded from this report and distributable inventories.

| Installed plugin | Enabled |
| --- | --- |
| Documents (`documents`) | true |
| PDF (`pdf`) | true |
| Spreadsheets (`spreadsheets`) | true |
| Presentations (`presentations`) | true |
| Template Creator (`template-creator`) | true |
| codex-app-tools (`codex-app-tools`) | true |
| Browser (`browser`) | true |
| unified-computer-use (`unified-computer-use`) | true |
| Chrome (`chrome`) | true |
| Computer Use (`computer-use`) | true |
| LaTeX (`latex`) | true |
| Visualize (`visualize`) | true |
| Google Drive (`google-drive`) | true |
| GitHub (`github`) | true |
| app-6a314a73f8ac819195b0d55e36b9c609 (`app-6a314a73f8ac819195b0d55e36b9c609`) | true |
| Supabase (`supabase`) | true |
| TinyFish (`app-695325bae7348191b58ae9349a963d22`) | true |
| Canva (`canva`) | true |
| Vercel (`vercel`) | true |
| Mobbin (`app-69fdb9081018819193707354f21b366e`) | true |
| app-6943e6f4a928819195962de16fb9ffe4 (`app-6943e6f4a928819195962de16fb9ffe4`) | true |
| Figma (`figma`) | true |
| Gamma (`app-698a098735908191989f5788d7ee317e`) | true |
| Context7 (`app-69ef18c674308191a2f952431f91ea61`) | true |
| RewriteLy Humanizer (`app-695fee383efc819190bc18e9d20289e3`) | true |
| Data (`data-analytics`) | true |
| Genspark AI Slides (`app-694d313cc67c8191804aee33eeb7dfec`) | true |
| Sider Scholar (`app-6948b485f5bc8191adb4df13f369cec7`) | true |
| Product Design (`product-design`) | true |
| Codex Security (`codex-security`) | true |
| OpenAI Developers (`openai-developers`) | true |
| Creative Production (`creative-production`) | true |
| Zotero (`zotero`) | true |
| Build Web Data Visualization (`build-web-data-visualization`) | true |
| A-Z Dictionary (`app-6960e92ebfa481918f4ccff0c8b219db`) | true |
| Cloud Environment (`cloud-environment`) | true |
| Yaps Text to Speech (`yaps-text-to-speech`) | true |
| Agent Consent Patterns (`agent-consent-patterns`) | true |
| Superpowers (`superpowers`) | true |
| CircleCI (`circleci`) | true |
| Build Web Apps (`build-web-apps`) | true |
| Default templates (`openai-templates`) | true |
| Sites (`sites`) | true |
| Plugin Management (`plugin-management`) | true |
| Pets (`work-pets`) | true |

## Observed routing examples

| Task | Selection |
| --- | --- |
| ตรวจ pull request ใน GitHub | `mcp__codex_apps__github_fetch_pr` |
| ค้นคว้างานวิจัย | `mcp__codex_apps__consensus_search` |
| สร้างไฟล์ docx | `documents:documents` skill workflow |
| ค้นหาข้อมูลบนเว็บ | native `web__run` |

These are selector results against actual exposed tool names. No third-party provider account data was accessed merely to test routing. Authentication remains unknown until the host performs an appropriate authorized call. Tool availability changes between chats; always re-resolve exact tool names before invoking.



Installed CLI inspection and local helper tests are not guest acceptance. Actual guest success requires a current expected identity report with passed/exitCode0/clean=true and evidence of requested commands.

## Official behavior reference

Installed plugins can contribute skills/tools to new sessions; service connection/authentication is separate and the host approval policy remains authoritative. See [official plugin documentation](https://learn.chatgpt.com/docs/plugins) and [skill concept](https://developers.openai.com/plugins/concepts/skills).

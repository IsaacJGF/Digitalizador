<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Agent connection
- Application database access uses external-only clients from `src/lib/external-database*`; bootstrap returns only public connection fields, requires all three Secrets, and rejects other destinations rather than falling back to managed Cloud. Generated integration clients and existing storage remain untouched.
- Keep remote MCP tools in `src/lib/mcp`, one definition per file, and let the SDK generate transport routes; this keeps the public catalog separate from browser UI.
- MCP database calls use only the public-key client and existing anonymous RLS, with explicit table/field allowlists; internal review and privileged clients must never enter this module.
- Question updates require the previously read timestamp to prevent overwriting concurrent edits; catalog rename/merge stays in the existing app workflow to preserve linked labels.

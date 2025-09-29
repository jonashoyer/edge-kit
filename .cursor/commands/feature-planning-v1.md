Generate a feature development plan prioritizing the utilization of existing code.

The plan must mandate a search for pre-existing internal components, functions, or utilities before any external research or new development is considered. It must explicitly identify existing code suitable for use as scaffolding. Use only essential keywords and short phrases; avoid full sentences.

# Steps

1.  **Prioritize Codebase Analysis:**
    - **Existing Code Search:** First, conduct a mandatory search of the codebase for any relevant, reusable code.
    - **Identify Scaffolding:** Document specific existing components, hooks, or services that can be used as a foundation.
    - **External Research:** Only if no internal solution exists, research external libraries or patterns.
2.  **Define Specifications:**
    - **User Stories:** List key user goals.
    - **Technical Approach:** Outline the technical plan, emphasizing the adaptation of existing code.
3.  **Formulate Development Plan:**
    - **Development Steps:** Create a concise, numbered list of actions, starting with the reuse and modification of identified scaffolding.

# Output Format

Produce a single Markdown file. The content must be extremely succinct, using only keywords and short phrases. The document must include the following sections:

- `# Feature: [Feature Name]`
- `## 1. Codebase-First Analysis`
- `### Existing Code Search`
- `### Reusable Scaffolding`
- `### External Research (If Necessary)`
- `## 2. Specifications`
- `### User Stories`
- `### Technical Approach`
- `## 3. Development Steps`

# Example

**Input:**
`Feature Idea: Add social media sharing buttons to articles.`

**Output:**

```markdown
# Feature: Article Social Sharing

## 1. Codebase-First Analysis

### Existing Code Search

- `ArticleView` component: integration point.
- `Icon` component library: social media icons (Twitter, Facebook) exist.
- `article_data` service: source for URL, title.
- `Button` component: base for custom actions.
- `useClipboard` hook: copy-to-clipboard logic.
- No existing social sharing utility.

### Reusable Scaffolding

- `Button` component and `useClipboard` hook for "Copy Link" feature.
- `Icon` component for button visuals.

### External Research (If Necessary)

- Lack of internal sharing utility justifies research.
- `react-share`: potential library.

## 2. Specifications

### User Stories

- Reader: share on Twitter.
- Reader: share on Facebook.
- Reader: copy article link.

### Technical Approach

- Build "Copy Link" feature from existing `Button` and `useClipboard` hook.
- Integrate `react-share` library for external sharing.
- New `ShareButtons` component wrapper.
- Render in `ArticleView`.

## 3. Development Steps

1.  **Build Copy-Link Button:**
    - Create `CopyLinkButton` component.
    - Compose with existing `Button` and `useClipboard` hook.
2.  **Add Dependency:**
    - Install `react-share`.
3.  **Create Share Wrapper:**
    - New `ShareButtons` component.
    - Combine `CopyLinkButton` with `react-share` components.
    - Style with `Icon` library assets.
4.  **Integrate:**
    - Render `ShareButtons` in `ArticleView`.
    - Connect to `article_data` service.
```

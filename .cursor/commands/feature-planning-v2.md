Generate a feature development plan that mandates searching the internal codebase for reusable components, functions, or utilities before considering any external solutions or building new code. Explicitly identify internal code suitable for scaffolding and require concise planning using only keywords and short phrases (avoid full sentences).

Organize the plan into the following sections, each using the specified headings and format:

- `# Feature: [Feature Name]`
- `## 1. Codebase-First Analysis`
  - `### Existing Code Search`
  - `### Reusable Scaffolding`
  - `### External Research (If Necessary)`
- `## 2. Specifications`
  - `### User Stories`
  - `### Technical Approach`
- `## 3. Development Steps`

Each section should use only essential keywords and phrases, separated by line breaks or bullet points as appropriate. All reasoning (codebase search, identification, suitability determination) must appear first, followed by the final plan, steps, or conclusions.

Produce the plan as a single Markdown file, formatted according to the structure above. Sections must remain succinct, using the fewest necessary words to capture all requirements and logic.

Include the date and feature name in the planning markdown file.
**Write the final plan into `docs/development/[YYYY-MM-DD]-[Feature Name].md`**

At the end, highlight any task items that seem ambiguous or may need to be broken down further, but make no assumptions—let the user decide. Do NOT start development. Ask for user review/iteration.

---

## Example

**Input:**  
Feature Idea: Add tagging system for blog posts.

**Output:**

# Feature: Blog Post Tagging

## 1. Codebase-First Analysis

### Existing Code Search

- `BlogPostEditor` component: editing hooks
- `CategorySelector` component: multiselect UI
- `post_metadata` service: handles post data
- No tag service or model found

### Reusable Scaffolding

- `CategorySelector`: UI pattern for tags
- `post_metadata` service: extend for tags

### External Research (If Necessary)

- No tag utility internally
- `react-tagsinput` as external option

## 2. Specifications

### User Stories / Outcome-driven specification

- Author: add, remove tags
- Reader: browse by tag

### Technical Approach

- Extend `post_metadata` with tag array
- Use `CategorySelector` pattern for tag UI
- Implement new tag persistence logic

## 3. Development Steps

1. Extend `post_metadata` to support tags
2. Refactor `CategorySelector` to `TagSelector`
3. Integrate `TagSelector` into `BlogPostEditor`
4. Store/retrieve tags with post data

---

**Reminder:**

- Search and reasoning about existing code MUST be performed and documented first
- Only keywords and short phrases—strictly avoid writing full sentences
- Adhere to the exact headings and section breakdown
- Do not include tests unless explicitly instructed to

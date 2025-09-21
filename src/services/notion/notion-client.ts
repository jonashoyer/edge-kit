import {
  type BlockObjectRequest,
  type BlockObjectResponse,
  Client,
  type CreatePageParameters,
  collectPaginatedAPI,
  type PageObjectResponse,
  type PartialBlockObjectResponse,
  type QueryDataSourceParameters,
  type RichTextItemResponse,
  type SearchResponse,
} from "@notionhq/client";
import type { QueryDataSourceResponse } from "@notionhq/client/build/src/api-endpoints";
import { markdownToBlocks } from "@tryfabric/martian";

type NotionObject = SearchResponse["results"][number];

type PropertyTypes = PageObjectResponse["properties"][string]["type"];

type PropertyTypeToObject = {
  [K in PropertyTypes]: Extract<
    PageObjectResponse["properties"][string],
    { type: K }
  >;
};

type PropertyTypeToValue = {
  [K in PropertyTypes]: Extract<
    PageObjectResponse["properties"][string],
    { type: K }
  > extends Record<K, infer V>
    ? V
    : never;
};

type RichTextTypes = "title" | "rich_text";
type PropertyValueReturn<T extends PropertyTypes> = T extends RichTextTypes
  ? string
  : PropertyTypeToValue[T];

export type NotionDatabase = {
  id: string;
  icon: string | null;
  name: string | null;
  archived: boolean;
  inTrash: boolean;
  pageId: string | null;
};

type QueryDatabaseFilterAnd = Extract<
  QueryDataSourceParameters["filter"],
  { and: unknown }
>["and"];

export class NotionClient {
  client: Client;

  constructor(apiKey: string) {
    this.client = new Client({ auth: apiKey });
  }

  async createPage(
    databaseId: string,
    properties: CreatePageParameters["properties"],
    markdown: string
  ) {
    const content = markdownToBlocks(markdown);
    const response = await this.client.pages.create({
      parent: { database_id: databaseId },
      content: content as unknown as BlockObjectRequest[],
      properties,
    });
    return response;
  }

  async recursiveCall<T>(
    fn: (cursor?: string) => Promise<{ data: T; cursor?: string | null }>,
    startCursor?: string
  ): Promise<T[]> {
    const { data, cursor: nextCursor } = await fn(startCursor);
    if (nextCursor) {
      return [data, ...(await this.recursiveCall(fn, nextCursor))];
    }
    return [data];
  }

  async getPage(pageId: string) {
    const page = await this.client.pages.retrieve({ page_id: pageId });
    return page;
  }

  /**
   * Fetches the content of a page from Notion and returns it as a markdown string
   * @param pageId - The ID of the page to fetch
   * @returns The content of the page as a markdown string
   */
  async getPageContent(pageId: string) {
    const pageChunks = await this.recursiveCall(async (cursor) => {
      const response = await this.client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: cursor,
      });
      return { data: response.results, cursor: response.next_cursor };
    });

    const page = pageChunks.flat();
    return NotionClient.notionBlocksToMarkdown(page);
  }

  static extractIcon(obj: NotionObject) {
    if (!("icon" in obj && obj.icon)) {
      return null;
    }

    if (obj.icon.type === "emoji") {
      return obj.icon.emoji;
    }

    if (obj.icon.type === "file") {
      return obj.icon.file.url;
    }

    if (obj.icon.type === "external") {
      return obj.icon.external.url;
    }

    return obj.icon.custom_emoji.url;
  }

  static uuidToId(uuid: string) {
    return uuid.replace(/-/g, "");
  }

  async getDatabases(cursor?: string | null): Promise<NotionDatabase[]> {
    if (cursor === null) {
      return [];
    }

    const searchResult = await this.client.search({
      filter: { value: "data_source", property: "object" },
      page_size: 100,
      start_cursor: cursor,
    });

    const databases = searchResult.results.map((result) => ({
      id: result.id,
      icon: NotionClient.extractIcon(result),
      name:
        "title" in result
          ? result.title
              .map((title) => ("plain_text" in title ? title.plain_text : ""))
              .join("")
          : null,
      archived: "archived" in result ? result.archived : false,
      inTrash: "in_trash" in result ? result.in_trash : false,
      pageId:
        "parent" in result && result.parent.type === "page_id"
          ? result.parent.page_id
          : null,
    }));

    return [
      ...databases,
      ...(await this.getDatabases(searchResult.next_cursor)),
    ];
  }

  async getDatabaseEntryChanges(
    databaseId: string,
    options: {
      startEditedTime?: string | Date | null;
      lastEditedTime?: string | Date | null;
      filter?: QueryDatabaseFilterAnd;
      cursor?: string;
    }
  ): Promise<QueryDataSourceResponse["results"]> {
    const startEditedTime =
      typeof options.startEditedTime === "string"
        ? options.startEditedTime
        : new Date(options.startEditedTime ?? new Date()).toISOString();

    const items = await collectPaginatedAPI(this.client.dataSources.query, {
      data_source_id: databaseId,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      filter: {
        and: [
          {
            timestamp: "last_edited_time",
            last_edited_time: {
              on_or_before: startEditedTime,
              after:
                options.lastEditedTime instanceof Date
                  ? options.lastEditedTime.toISOString()
                  : (options.lastEditedTime ?? undefined),
            },
          },
          ...(options.filter ?? []),
        ],
      },
      start_cursor: options.cursor,
    });

    return items;
  }

  static getProperty<TType extends keyof PropertyTypeToObject>(
    obj: NotionObject,
    type: TType,
    property: string
  ): PropertyTypeToObject[TType] | null {
    if (obj.object !== "page") {
      return null;
    }

    const prop = "properties" in obj ? obj.properties?.[property] : null;
    return prop?.type === type ? (prop as PropertyTypeToObject[TType]) : null;
  }

  static getPropertyValue<TType extends PropertyTypes>(
    obj: NotionObject,
    type: TType,
    property: string
  ): PropertyValueReturn<TType> | null {
    const prop = NotionClient.getProperty(obj, type, property);
    if (!(prop && type in prop)) {
      return null;
    }

    const value = prop[type as keyof typeof prop];
    const isRichText = ["title", "rich_text"].includes(type);

    if (isRichText && Array.isArray(value)) {
      return NotionClient.notionRichTextToMarkdown(
        value
      ) as PropertyValueReturn<TType>;
    }

    return value as PropertyValueReturn<TType>;
  }

  async getUserSelf() {
    const response = await this.client.users.me({});
    return response;
  }

  static applyAnnotations(
    text: string,
    annotation: RichTextItemResponse["annotations"]
  ) {
    const { bold, code, italic, strikethrough, underline, color } = annotation;
    let formattedText = text;

    if (bold) {
      formattedText = `**${formattedText}**`;
    }
    if (code) {
      formattedText = `\`${formattedText}\``;
    }
    if (italic) {
      formattedText = `*${formattedText}*`;
    }
    if (strikethrough) {
      formattedText = `~~${formattedText}~~`;
    }
    if (underline) {
      formattedText = `<ins>${formattedText}</ins>`;
    }
    if (color !== "default") {
      formattedText = `==${formattedText}==`;
    }

    return formattedText;
  }

  static notionRichTextToMarkdown(richText: RichTextItemResponse[]) {
    const getContent = (e: RichTextItemResponse) => {
      switch (e.type) {
        case "text":
          if (e.text.link) {
            return `[${e.text.content}](${e.text.link.url})`;
          }
          return e.text.content;
        case "equation":
          return `$${e.equation.expression}$`;
        case "mention":
          switch (e.mention.type) {
            case "user":
              return `@${"name" in e.mention.user ? e.mention.user.name : e.mention.user.id}`;
            case "date":
            // const { start, end, time_zone } = e.mention.date;
            // if (end) return `[${new Date(start).toISOString()} => ${new Date(end).toISOString()}${time_zone ? ` (${time_zone})` : ''}]`;
            // return `[${new Date(start).toISOString()}${time_zone ? ` (${time_zone})` : ''}]`;
            case "database":
            case "link_preview":
            case "page":
            case "template_mention":
              return e.plain_text;
            default:
              return "";
          }
        default:
          return "";
      }
    };

    return richText
      .map((e) => NotionClient.applyAnnotations(getContent(e), e.annotations))
      .join("");
  }

  static notionBlocksToMarkdown(
    blocks: (BlockObjectResponse | PartialBlockObjectResponse)[]
  ): string {
    return (
      blocks
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Not that complex
        .map((block) => {
          if (!("type" in block)) {
            return null;
          }

          switch (block.type) {
            case "heading_1":
              return `# ${NotionClient.notionRichTextToMarkdown(block.heading_1.rich_text)}`;
            case "heading_2":
              return `## ${NotionClient.notionRichTextToMarkdown(block.heading_2.rich_text)}`;
            case "heading_3":
              return `### ${NotionClient.notionRichTextToMarkdown(block.heading_3.rich_text)}`;
            case "paragraph":
              return NotionClient.notionRichTextToMarkdown(
                block.paragraph.rich_text
              );
            case "bulleted_list_item":
              return `- ${NotionClient.notionRichTextToMarkdown(block.bulleted_list_item.rich_text)}`;
            case "numbered_list_item":
              return `1. ${NotionClient.notionRichTextToMarkdown(block.numbered_list_item.rich_text)}`;
            case "to_do":
              return `- [${block.to_do.checked ? "x" : " "}] ${NotionClient.notionRichTextToMarkdown(block.to_do.rich_text)}`;
            case "quote":
              return `> ${NotionClient.notionRichTextToMarkdown(block.quote.rich_text)}`;
            case "code":
              return `\`\`\`${block.code.language}\n${NotionClient.notionRichTextToMarkdown(block.code.rich_text)}\n\`\`\``;
            case "image":
              return `![${NotionClient.notionRichTextToMarkdown(block.image.caption)}](${block.image.type === "file" ? block.image.file.url : block.image.external.url})`;
            case "callout":
              return `> ${NotionClient.notionRichTextToMarkdown(block.callout.rich_text)}`;
            case "child_database":
              return `[${block.child_database.title}](child_database)`;
            case "child_page":
              return `[${block.child_page.title}](child_page)`;
            case "column":
              return `column:${Object.keys(block.column).join(",")}`;
            case "column_list":
              return `column_list:${Object.keys(block.column_list).join(",")}`;
            case "divider":
              return "---";
            case "embed":
              return `[${NotionClient.notionRichTextToMarkdown(block.embed.caption)}](${block.embed.url})`;
            case "equation":
              return `$$${block.equation.expression}$$`;
            case "file":
              return `[${NotionClient.notionRichTextToMarkdown(block.file.caption)}](${block.file.type === "file" ? block.file.file.url : block.file.external.url})`;
            case "link_preview":
              return `[${block.link_preview.url}](${block.link_preview.url})`;
            case "link_to_page": {
              let id = "";

              if ("page_id" in block.link_to_page) {
                id = block.link_to_page.page_id;
              } else if ("database_id" in block.link_to_page) {
                id = block.link_to_page.database_id;
              } else if ("comment_id" in block.link_to_page) {
                id = block.link_to_page.comment_id;
              }

              return `[${id}](page)`;
            }
            case "pdf":
              return `[${NotionClient.notionRichTextToMarkdown(block.pdf.caption)}](${block.pdf.type === "file" ? block.pdf.file.url : block.pdf.external.url})`;
            case "table_of_contents":
              return "table_of_contents";
            // case 'table_row':
            //   return `table_row:${Object.keys(block.table_row)}`;
            // case 'template':
            //   return `template:${Object.keys(block.template)}`;
            // case 'toggle':
            //   return `toggle:${Object.keys(block.toggle)}`;
            // case 'unsupported':
            //   return `unsupported:${block.unsupported.type}`;
            // case 'video':
            //   return `[${block.bookmark.url}](${block.bookmark.url})`;
            case "breadcrumb":
              return `[${block.breadcrumb.url}](${block.breadcrumb.url})`;
            case "synced_block":
              return `[${block.synced_block.synced_from?.block_id}](${block.synced_block.synced_from?.block_id})`;
            // case "table":
            default:
              return "";
          }
        })
        .filter(Boolean)
        .join("\n\n")
    );
  }
}

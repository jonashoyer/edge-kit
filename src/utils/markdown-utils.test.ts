import { describe, expect, it } from "vitest";
import {
  buildMarkdown,
  buildXml,
  type MdSchemaConfig,
  mdSchema,
} from "./markdown-utils";

describe("markdown-utils", () => {
  describe("basic markdown rendering", () => {
    it("should render simple fields with plain labels", () => {
      type User = {
        name: string;
        age: number;
      };

      const config: MdSchemaConfig<User> = {
        name: {},
        age: {},
      };

      const result = buildMarkdown({ name: "Alice", age: 30 }, config);
      expect(result).toBe("name: Alice\nage: 30");
    });

    it("should use custom labels", () => {
      type User = {
        name: string;
        email: string;
      };

      const config: MdSchemaConfig<User> = {
        name: { label: "Full Name" },
        email: { label: "Email Address" },
      };

      const result = buildMarkdown(
        { name: "Bob", email: "bob@example.com" },
        config
      );
      expect(result).toBe("Full Name: Bob\nEmail Address: bob@example.com");
    });
  });

  describe("label formatting", () => {
    it("should format labels as bold", () => {
      const config: MdSchemaConfig<{ name: string }> = {
        name: { format: "bold" },
      };

      const result = buildMarkdown({ name: "Charlie" }, config);
      expect(result).toBe("**name**: Charlie");
    });

    it("should format labels as italic", () => {
      const config: MdSchemaConfig<{ name: string }> = {
        name: { format: "italic" },
      };

      const result = buildMarkdown({ name: "Diana" }, config);
      expect(result).toBe("*name*: Diana");
    });

    it("should format labels as code", () => {
      const config: MdSchemaConfig<{ apiKey: string }> = {
        apiKey: { format: "code" },
      };

      const result = buildMarkdown({ apiKey: "secret123" }, config);
      expect(result).toBe("`apiKey`: secret123");
    });

    it("should format labels as plain (default)", () => {
      const config: MdSchemaConfig<{ name: string }> = {
        name: { format: "plain" },
      };

      const result = buildMarkdown({ name: "Eve" }, config);
      expect(result).toBe("name: Eve");
    });
  });

  describe("array rendering", () => {
    it("should render arrays inline by default", () => {
      const config: MdSchemaConfig<{ tags: string[] }> = {
        tags: {},
      };

      const result = buildMarkdown({ tags: ["a", "b", "c"] }, config);
      expect(result).toBe("tags: a, b, c");
    });

    it("should respect arrayMode inline", () => {
      const config: MdSchemaConfig<{ tags: string[] }> = {
        tags: { arrayMode: "inline" },
      };

      const result = buildMarkdown(
        { tags: ["one", "two", "three", "four", "five"] },
        config
      );
      expect(result).toBe("tags: one, two, three, four, five");
    });

    it("should respect arrayMode bulleted", () => {
      const config: MdSchemaConfig<{ tags: string[] }> = {
        tags: { arrayMode: "bulleted" },
      };

      const result = buildMarkdown({ tags: ["a", "b"] }, config);
      expect(result).toBe("tags: - a\n- b");
    });
  });

  describe("nested objects", () => {
    it("should render nested objects with fields config", () => {
      type User = {
        name: string;
        address: {
          city: string;
          country: string;
        };
      };

      const config: MdSchemaConfig<User> = {
        name: {},
        address: {
          fields: {
            city: {},
            country: {},
          },
        },
      };

      const result = buildMarkdown(
        {
          name: "Frank",
          address: { city: "NYC", country: "USA" },
        },
        config
      );

      expect(result).toBe(
        "name: Frank\naddress: \n  city: NYC\n  country: USA"
      );
    });

    it("should render deeply nested objects", () => {
      type Data = {
        level1: {
          level2: {
            value: string;
          };
        };
      };

      const config: MdSchemaConfig<Data> = {
        level1: {
          fields: {
            level2: {
              fields: {
                value: {},
              },
            },
          },
        },
      };

      const result = buildMarkdown(
        {
          level1: {
            level2: {
              value: "deep",
            },
          },
        },
        config
      );

      expect(result).toBe("level1: \n  level2: \n    value: deep");
    });
  });

  describe("transform function", () => {
    it("should apply transform to values", () => {
      const config: MdSchemaConfig<{ date: Date }> = {
        date: {
          transform: (date: Date) => date.toISOString().split("T")[0],
        },
      };

      const result = buildMarkdown({ date: new Date("2025-10-01") }, config);
      expect(result).toBe("date: 2025-10-01");
    });

    it("should apply transform before rendering", () => {
      const config: MdSchemaConfig<{ count: number }> = {
        count: {
          transform: (n: number) => `${n} items`,
        },
      };

      const result = buildMarkdown({ count: 42 }, config);
      expect(result).toBe("count: 42 items");
    });
  });

  describe("omission of empty values", () => {
    it("should omit undefined fields by default", () => {
      const config: MdSchemaConfig<{ name: string; age?: number }> = {
        name: {},
        age: {},
      };

      const result = buildMarkdown({ name: "Grace" }, config);
      expect(result).toBe("name: Grace");
    });

    it("should omit null fields by default", () => {
      const config: MdSchemaConfig<{ name: string; email: string | null }> = {
        name: {},
        email: {},
      };

      const result = buildMarkdown({ name: "Henry", email: null }, config);
      expect(result).toBe("name: Henry");
    });

    it("should omit empty strings by default", () => {
      const config: MdSchemaConfig<{ name: string; bio: string }> = {
        name: {},
        bio: {},
      };

      const result = buildMarkdown({ name: "Iris", bio: "" }, config);
      expect(result).toBe("name: Iris");
    });

    it("should omit empty arrays by default", () => {
      const config: MdSchemaConfig<{ name: string; tags: string[] }> = {
        name: {},
        tags: {},
      };

      const result = buildMarkdown({ name: "Jack", tags: [] }, config);
      expect(result).toBe("name: Jack");
    });
  });

  describe("XML rendering", () => {
    it("should render simple fields as XML", () => {
      type User = {
        name: string;
        age: number;
      };

      const config: MdSchemaConfig<User> = {
        name: {},
        age: {},
      };

      const result = buildXml({ name: "Karen", age: 25 }, config);
      expect(result).toContain("<root>");
      expect(result).toContain("<name>Karen</name>");
      expect(result).toContain("<age>25</age>");
      expect(result).toContain("</root>");
    });

    it("should use custom root name", () => {
      const config: MdSchemaConfig<{ value: string }> = {
        value: {},
      };

      const result = buildXml({ value: "test" }, config, "custom");
      expect(result).toContain("<custom>");
      expect(result).toContain("</custom>");
    });

    it("should apply transforms before XML conversion", () => {
      const config: MdSchemaConfig<{ date: Date }> = {
        date: {
          transform: (date: Date) => date.toISOString(),
        },
      };

      const result = buildXml({ date: new Date("2025-10-01") }, config);
      expect(result).toContain("<date>2025-10-01");
    });

    it("should omit fields in XML by default", () => {
      const config: MdSchemaConfig<{ name: string; optional?: string }> = {
        name: {},
        optional: {},
      };

      const result = buildXml({ name: "Laura" }, config);
      expect(result).toContain("<name>Laura</name>");
      expect(result).not.toContain("<optional");
    });
  });

  describe("mdSchema factory", () => {
    it("should create schema with build method", () => {
      const schema = mdSchema<{ name: string }>({
        name: { format: "bold" },
      });

      const result = schema.build({ name: "Mike" });
      expect(result).toBe("**name**: Mike");
    });

    it("should create schema with buildXml method", () => {
      const schema = mdSchema<{ name: string }>({
        name: {},
      });

      const result = schema.buildXml({ name: "Nancy" });
      expect(result).toContain("<name>Nancy</name>");
    });

    it("should store config as readonly", () => {
      const schema = mdSchema<{ value: number }>({
        value: { label: "Value" },
      });

      expect(schema.config.value?.label).toBe("Value");
    });
  });

  describe("complex scenarios", () => {
    it("should handle arrays of nested objects", () => {
      type Team = {
        name: string;
        members: Array<{ name: string; role: string }>;
      };

      const config: MdSchemaConfig<Team> = {
        name: {},
        members: {
          arrayMode: "bulleted",
          fields: {
            name: {},
            role: {},
          },
        },
      };

      const result = buildMarkdown(
        {
          name: "Engineering",
          members: [
            { name: "Alice", role: "Lead" },
            { name: "Bob", role: "Dev" },
          ],
        },
        config
      );

      expect(result).toContain("name: Engineering");
      expect(result).toContain("- name: Alice");
      expect(result).toContain("role: Lead");
      expect(result).toContain("- name: Bob");
      expect(result).toContain("role: Dev");
    });

    it("should combine multiple formatting options", () => {
      type Product = {
        id: string;
        name: string;
        price: number;
        tags: string[];
        metadata: {
          createdAt: Date;
        };
      };

      const config: MdSchemaConfig<Product> = {
        id: { format: "code" },
        name: { format: "bold" },
        price: {
          label: "Price (USD)",
          transform: (n: number) => `$${n.toFixed(2)}`,
        },
        tags: { arrayMode: "inline" },
        metadata: {
          fields: {
            createdAt: {
              label: "Created",
              transform: (d: Date) => d.toISOString().split("T")[0],
            },
          },
        },
      };

      const result = buildMarkdown(
        {
          id: "prod-123",
          name: "Widget",
          price: 29.99,
          tags: ["new", "featured"],
          metadata: { createdAt: new Date("2025-01-15") },
        },
        config
      );

      expect(result).toContain("`id`: prod-123");
      expect(result).toContain("**name**: Widget");
      expect(result).toContain("Price (USD): $29.99");
      expect(result).toContain("tags: new, featured");
      expect(result).toContain("Created: 2025-01-15");
    });

    it("should handle empty objects gracefully", () => {
      const config: MdSchemaConfig<{ value?: string }> = {} as any;

      const result = buildMarkdown({}, config);
      expect(result).toBe("");
    });

    it("should handle boolean values", () => {
      const config: MdSchemaConfig<{ active: boolean }> = {
        active: {},
      };

      const result = buildMarkdown({ active: true }, config);
      expect(result).toBe("active: true");
    });

    it("should handle numeric zero without omitting", () => {
      const config: MdSchemaConfig<{ count: number }> = {
        count: {},
      };

      const result = buildMarkdown({ count: 0 }, config);
      expect(result).toBe("count: 0");
    });
  });

  describe("edge cases", () => {
    it("should handle fields not in data", () => {
      const config: MdSchemaConfig<{ name: string; age?: number }> = {
        name: {},
        age: {},
      };

      const result = buildMarkdown({ name: "Oscar" }, config);
      expect(result).toBe("name: Oscar");
    });

    it("should handle whitespace-only strings (omit by default)", () => {
      const config: MdSchemaConfig<{ text: string }> = {
        text: {},
      };

      const result = buildMarkdown({ text: "   " }, config);
      expect(result).toBe("");
    });

    it("should stringify objects without nested schema", () => {
      const config: MdSchemaConfig<{ data: Record<string, unknown> }> = {
        data: {},
      };

      const result = buildMarkdown({ data: { a: 1, b: 2 } }, config);
      expect(result).toBe('data: {"a":1,"b":2}');
    });

    it("should handle transform returning null", () => {
      const config: MdSchemaConfig<{ value: string }> = {
        value: {
          transform: () => null,
        },
      };

      const result = buildMarkdown({ value: "anything" }, config);
      expect(result).toBe("");
    });
  });
});

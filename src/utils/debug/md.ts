/** biome-ignore-all lint/suspicious/noConsole: This is a debug file */
/** biome-ignore-all lint/correctness/useSingleJsDocAsterisk: No */
import { mdSchema } from "../markdown-utils";

const log = (label: string, value: string) => {
  console.log(`--- ${label} ---\n${value}`);
};

log(
  "Basic",
  mdSchema({
    name: { format: "bold" },
    email: { format: "code" },
    age: { label: "Age (years)" },
    tags: { arrayMode: "inline" },
  }).build({
    name: "John Doe",
    email: "john.doe@example.com",
    age: 30,
    tags: ["tag1", "tag2", "tag3"],
  })
);

log(
  "Array",
  mdSchema({
    name: { format: "bold" },
    email: { format: "code" },
  }).build([
    {
      name: "John Doe",
      email: "john.doe@example.com",
    },
    {
      name: "Jane Doe",
      email: "jane.doe@example.com",
    },
  ])
);

log(
  "Label Formatting",
  mdSchema({
    profile: {
      outputFormat: "markdown",
      fields: {
        name: { format: "bold" },
        email: { format: "code" },
      },
    },
  }).buildXml(
    {
      profile: {
        name: "John Doe",
        email: "john.doe@example.com",
      },
    },
    { flat: true }
  )
);
/**
--- Label Formatting ---
<root>
<profile>
**name**: John Doe
`email`: john.doe@example.com
</profile>
</root> 
 */

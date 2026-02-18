export interface TreeProperty {
  key: string;
  value?: string;
  children?: TreeProperty[];
  separator?: boolean;
}

export function generateTreeTable(
  title: string,
  properties: TreeProperty[],
): string {
  const lines: string[] = [];
  const titleLine = `╭─${title}─╮`;
  const headerLine = `╰─┬${"─".repeat(titleLine.length - 4)}╯`;

  lines.push(titleLine);
  lines.push(headerLine);

  properties.forEach((prop, index) => {
    if (prop.separator) {
      lines.push("  │");
    }

    const isLast = index === properties.length - 1;
    const prefix = isLast ? "  └──" : "  ├──";
    const line = prop.value
      ? `${prefix} ${prop.key}: ${prop.value}`
      : `${prefix} ${prop.key}`;
    lines.push(line);

    if (prop.children && prop.children.length > 0) {
      const childPrefix = isLast ? "      " : "  │  ";
      prop.children.forEach((child, childIndex) => {
        const isLastChild = childIndex === prop.children!.length - 1;
        const childConnector = isLastChild ? "└──" : "├──";
        const childLine = child.value
          ? `${childConnector} ${child.key}: ${child.value}`
          : `${childConnector} ${child.key}`;
        lines.push(`${childPrefix}${childLine}`);
      });
    }
  });

  return lines.join("\n");
}

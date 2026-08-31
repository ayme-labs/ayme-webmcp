import { z } from "zod";

export const AriaRefSchema = z.string().brand<"AriaRef">();
export type AriaRef = z.infer<typeof AriaRefSchema>;

export const PlaywrightLocatorStringSchema = z
  .string()
  .brand<"PlaywrightLocatorString">();
export type PlaywrightLocatorString = z.infer<
  typeof PlaywrightLocatorStringSchema
>;

export type AriaRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "blockquote"
  | "button"
  | "caption"
  | "cell"
  | "checkbox"
  | "code"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "deletion"
  | "dialog"
  | "directory"
  | "document"
  | "emphasis"
  | "feed"
  | "figure"
  | "form"
  | "generic"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "img"
  | "insertion"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "mark"
  | "marquee"
  | "math"
  | "meter"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "paragraph"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "strong"
  | "subscript"
  | "superscript"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "time"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem";

type AriaProps = {
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  active?: boolean;
  invalid?: boolean | "grammar" | "spelling";
  level?: number;
  pressed?: boolean | "mixed";
  selected?: boolean;
};

type AriaBox = {
  visible: boolean;
  inline: boolean;
  cursor?: string;
};

export type AriaNode = AriaProps & {
  role: AriaRole | "fragment" | "iframe";
  name: string;
  ref?: string;
  children: (AriaNode | string)[];
  box: AriaBox;
  receivesPointerEvents: boolean;
  props: Record<string, string>;
};

import type { HistoryRound } from "./platform-adapter";

export interface HandoverDraft {
  markdown: string;
  roundCount: number;
  includedRecentRounds: number;
  sourceTruncated: boolean;
}
const decisions =
  /确认|以后|始终|必须|不要|禁止|保持|优先|固定|改成|决定|采用|只需要|先.{0,9}再|按.{0,10}(执行|操作|计划)|要求|默认|不能|一致|记住| agreed | always | never | must | decided | prefer /i;
const actions =
  /继续|下一步|还没|没有|需要|待办|检查|修复|优化|添加|开发|修改|制作|实现|测试|更新|安排|跟进|计划|待确认|请|帮我|未完成|todo|pending|next step/i;
const completed =
  /已完成|完成了|成功|已经修复|已经上传|已经保存|测试通过|全部通过|发布成功|已创建|已安装|built successfully|tests passed/i;

function clean(value: string, maxChars: number): string {
  const normalized = value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim();
  return normalized.length <= maxChars
    ? normalized
    : normalized.slice(0, maxChars) + "…（节选）";
}
function pick(
  rounds: HistoryRound[],
  kind: "user" | "assistant",
  pattern: RegExp,
  count: number,
  maxChars: number,
): string[] {
  const seen = new Set<string>();
  const chosen: string[] = [];
  for (let i = rounds.length - 1; i >= 0; i--) {
    const raw = kind === "user" ? rounds[i]?.promptText : rounds[i]?.answerText;
    if (!raw || !pattern.test(raw)) continue;
    const excerpt = clean(raw, maxChars);
    if (excerpt.length < 7) continue;
    const key = excerpt.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(excerpt);
    if (chosen.length >= count) break;
  }
  return chosen.reverse();
}
function numbered(items: string[]): string {
  return items.length
    ? items
        .map((item, i) => String(i + 1) + ". " + item.replace(/\n/g, " "))
        .join("\n")
    : "未从可读取的消息中找到明确候选项，请手动补充。";
}
/**
 * Local and intentionally conservative. No model/API call, toolText,
 * storage or cloud synchronization; users review and explicitly copy.
 */
export function createHandoverDraft(
  args: { title: string; conversationId: string; rounds: HistoryRound[] },
  maxLength = 26000,
): HandoverDraft {
  const rounds = args.rounds;
  const decided = pick(rounds, "user", decisions, 10, 380);
  const todo = pick(rounds.slice(-18), "user", actions, 7, 340);
  const done = pick(rounds.slice(-24), "assistant", completed, 5, 330);
  const recent = rounds.slice(-8);
  const recentText = recent.map((round, i) => {
    const ordinal = rounds.length - recent.length + i + 1;
    return (
      "### 第 " +
      ordinal +
      " 轮\n用户：" +
      (clean(round.promptText, 600) || "（文本未读取）") +
      "\n助手：" +
      (clean(round.answerText, 850) || "（文本未读取）")
    );
  });
  const title = clean(args.title || "未命名聊天", 120);
  const conversationId = clean(args.conversationId, 120);
  const body = [
    "# 对话交接草稿（请先检查、编辑再复制）",
    "来源：" + title,
    "原聊天 ID：" + conversationId,
    "可读取轮次：" + rounds.length,
    "说明：这是本地规则提取的候选信息，不等于经过 AI 语义核实的总结。",
    "缺失范围：工具调用结果、附件、图片、隐藏上下文和服务端压缩信息未纳入。",
    "",
    "## 用户明确提到的规则／决定（候选，需核对）",
    numbered(decided),
    "",
    "## 后续动作／未解决事项（候选，不代表全部仍未完成）",
    numbered(todo),
    "",
    "## 助手曾表示已完成的事情（未经独立验证）",
    numbered(done),
    "",
    "## 最近对话原文节选（辅助补漏）",
    recentText.join("\n\n") || "当前没有可读取的完整对话轮次。",
    "",
    "## 在新窗口继续时",
    "请先核对上述内容，区分已经完成、仍待办及不确定事项；不要把候选条目直接当作事实。继续上一窗口的工作，必要时让我补充遗漏。",
  ].join("\n");
  const limit = Math.max(4000, maxLength);
  return {
    markdown:
      body.length <= limit
        ? body
        : body.slice(0, limit - 130) +
          "\n\n（草稿因篇幅限制已截断，可能遗漏信息，请按需要补充。）",
    roundCount: rounds.length,
    includedRecentRounds: recent.length,
    sourceTruncated: body.length > limit,
  };
}

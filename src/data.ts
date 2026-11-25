import type { Article, Library, Source } from "./model";
import { fontSizes } from "./font-sizes.ts";

export const initialSources: Source[] = [
  {
    id: "independent",
    name: "独立博客",
    url: "https://independent.example/feed.xml",
    kind: "demo",
  },
  {
    id: "engineering",
    name: "工程手记",
    url: "https://engineering.example/feed.xml",
    kind: "demo",
  },
  {
    id: "interface",
    name: "界面札记",
    url: "https://interface.example/feed.xml",
    kind: "demo",
  },
];

export const initialArticles: Article[] = [
  {
    id: "room-to-read",
    sourceId: "independent",
    title: "为自己的信息生活留一点空白",
    demo: true,
    date: "2026-11-17T09:40:00+08:00",
    excerpt:
      "在信息愈发充沛的今天，真正稀缺的不是新内容，而是可以沉下心来阅读和思考的时间。我们或许无法减少世界的喧嚣，但可以主动选择。",
    html: `<p>在信息愈发充沛的今天，真正稀缺的不是新内容，而是可以沉下心来阅读和思考的时间。我们或许无法减少世界的喧嚣，但可以主动选择让哪些信息进入自己的生活，并为阅读留出一块稳定、安静的空间。</p>
<p>这些年，我的阅读习惯逐渐从“追更”转向“慢读”。不再试图跟上所有的热点，而是更关注那些经过时间检验、真正启发思考的内容。它们可能是一篇独立博客的长文、一个开发者的实践记录，或者对某个技术趋势的深入分析。数量不多，却常常能在合适的时机提供新的视角。</p>
<h2>从主动选择开始</h2>
<p>想要回到阅读本身，第一步是主动选择信息源。与其把注意力分散在无数碎片内容上，不如花一点时间梳理自己的订阅：哪些作者长期输出高质量的思考？哪些主题真正值得持续关注？当信息源变得更少、更可靠，阅读也会重新变得轻松而有所期待。</p>
<blockquote>好的信息源不会让你觉得每时每刻都要追赶，而是帮助你更清晰地理解问题，并在长期中慢慢积累判断力。</blockquote>
<p>当然，这并不意味着完全拒绝新的内容。相反，保持一定的开放性依然重要。只是相比被动地接收算法推荐的海量信息，我更愿意用阅读来建立自己的节奏：定期整理订阅，保留真正有价值的来源，偶尔也允许自己离线阅读，给思考留一点余地。</p>`,
  },
  {
    id: "stable-state",
    sourceId: "engineering",
    title: "小工具为什么需要稳定的状态",
    demo: true,
    date: "2026-11-17T11:20:00+08:00",
    excerpt:
      "一个好用的小工具，往往不在于功能有多复杂，而在于它的状态是否稳定、可预期。稳定的状态，让人愿意把工作交给它。",
    html: `<p>一个好用的小工具，往往不在于功能有多复杂，而在于它的状态是否稳定、可预期。你刚刚选中的文章，不会因为一次后台刷新就消失；你正在输入的内容，不会因为网络请求返回而被覆盖。</p><h2>让操作有明确的结果</h2><p>状态设计首先回答一个朴素的问题：用户做完这一步，接下来应该看到什么？一次收藏应当立即可见，一次失败应当保留输入，一次重启应当能够接着上次的工作。</p><pre><code>type ReadingState = {\n  articleId: string;\n  isSaved: boolean;\n  scrollPosition: number;\n};</code></pre><p>将来自订阅源的内容和用户自己的阅读状态分开保存，刷新文章时就不必重新猜测用户是否已经读过。简单的边界，比复杂的补救更可靠。</p><h2>先验证最容易丢失的部分</h2><p>试试在刷新时继续阅读，在保存时切换文章，在断网时重新打开应用。只要这些路径仍然自然，这个小工具就开始值得信任了。</p><blockquote>可靠不是从来不失败，而是失败之后，仍然知道自己的工作在哪里。</blockquote>`,
  },
  {
    id: "quiet-interfaces",
    sourceId: "interface",
    title: "让界面安静下来的几个选择",
    demo: true,
    date: "2026-11-17T13:05:00+08:00",
    excerpt:
      "界面中的每一个元素都会争夺注意力。如何克制地使用颜色、层级和动效，让界面回归内容本身，是设计里最细微的功夫。",
    html: `<p>界面中的每一个元素都会争夺注意力。如何克制地使用颜色、层级和动效，让界面回归内容本身，是设计里最细微的功夫。</p><h2>先安排顺序，再添加装饰</h2><p>阅读工具的主角应当是文字。导航帮助我们找到文章，列表帮助我们判断是否值得读，而正文负责承载真正重要的内容。这三者需要清楚的边界，却不需要三个厚重的盒子。</p><table><thead><tr><th>视觉角色</th><th>选择</th></tr></thead><tbody><tr><td>正文</td><td>舒适的行宽和足够的行距</td></tr><tr><td>导航</td><td>稳定位置，明确的选中状态</td></tr><tr><td>反馈</td><td>靠近当前操作，简短且可恢复</td></tr></tbody></table><h2>颜色要有理由</h2><p>强调色可以表示“你现在在哪里”，也可以表示“接下来可以做什么”。当它无处不在时，就不再具有任何方向感。留下少量绿色，让其余部分安静下来。</p><p>好的留白不是空，而是让相邻的事物有各自呼吸的空间。</p>`,
  },
  {
    id: "local-first",
    sourceId: "engineering",
    title: "A small guide to local-first software",
    demo: true,
    date: "2026-11-17T15:10:00+08:00",
    excerpt:
      "Local-first software puts your data on your own device, works offline, and keeps you in control. Start with the smallest useful promise.",
    html: `<p lang="en">Local-first software begins with a small promise: the work on your device belongs to you. You should be able to open it, understand it, and keep using it when the network is unavailable.</p><h2 lang="en">Start with ownership</h2><p lang="en">A reading library is a good place to practice this idea. The publisher provides the article, but your reading history, bookmarks, and notes are your own. Treat those as separate kinds of data.</p><blockquote lang="en">The best software gives you a place to think, then gets out of your way.</blockquote><h2 lang="en">Make the useful path reliable</h2><p lang="en">Open an article. Read it. Save it for later. Close the app and come back tomorrow. These ordinary moments deserve the same care as the first launch.</p><p lang="en">Start with a clear data model and a readable export. Add coordination when the product actually needs it. Complexity should earn its place.</p>`,
  },
  {
    id: "beyond-code",
    sourceId: "independent",
    title: "代码之外的阅读习惯",
    demo: true,
    date: "2026-11-17T17:30:00+08:00",
    excerpt:
      "作为开发者，我们的注意力很容易被代码、需求和工具占据。但长期来看，阅读仍然是拓宽视野、保持好奇心的一种方式。",
    html: `<p>作为开发者，我们的注意力很容易被代码、需求和工具占据。但长期来看，阅读仍然是拓宽视野、保持好奇心的一种方式。</p><h2>允许自己读得慢一点</h2><p>我习惯在一周里留下两个没有明确目标的阅读时段。可能是一篇讲城市的随笔，可能是一封独立作者的通讯，也可能是一段关于设计的讨论。它们不一定立刻有用，却会在某个意想不到的时刻建立联系。</p><p>阅读不必总是生产资料。选择一篇想读的文章，关掉无关的窗口，把这几分钟留给它，就已经足够。</p><h2>把有意思的东西留下来</h2><p>遇到值得重读的文章，先收藏。每个月再回头看看，哪些想法经得起时间，哪些问题一直在吸引自己。一个人的收藏夹，有时比履历更能说明他在关心什么。</p><blockquote>不是每一页都需要记住，但认真读过的东西，会慢慢改变我们看待问题的方式。</blockquote>`,
  },
];

export const extraSource: Source = {
  id: "slow-writing",
  name: "慢写周刊",
  url: "https://slow-writing.example/feed.xml",
  kind: "demo",
};
export const extraArticle: Article = {
  id: "weekend-reading",
  sourceId: extraSource.id,
  title: "把周末留给一本没读完的书",
  demo: true,
  date: "2026-11-16T16:25:00+08:00",
  excerpt:
    "不急着列出下一份书单，先回到那本只读了一半的书里。阅读的乐趣，也在于重新出发。",
  html: "<p>不急着列出下一份书单，先回到那本只读了一半的书里。阅读的乐趣，也在于重新出发。</p><h2>留一段完整的时间</h2><p>泡一杯茶，把手机放到另一个房间，不用给今天的阅读设定页数。翻开书签所在的那页，看看上一次的自己停在了哪里。</p><blockquote>有些想法，需要在安静的地方待一会儿，才会慢慢清晰。</blockquote><p>下次读到这里时，也许你已经有了新的问题。那就带着它，继续往前读。</p>",
};

export function createLibrary(): Library {
  return {
    version: 1,
    sources: initialSources.map((source) => ({ ...source })),
    articles: initialArticles.map((article) => ({ ...article })),
    read: [],
    saved: [],
    positions: {},
    preferences: {
      fontSize: fontSizes.readingDefault,
      font: "sans",
      theme: "paper",
      accentColor: "",
      uiFontFamily: "",
      readingFontFamily: "",
    },
    selectedId: initialArticles[0].id,
  };
}

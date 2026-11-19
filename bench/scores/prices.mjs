const claude = 'https://platform.claude.com/docs/en/about-claude/pricing'
const openai = 'https://developers.openai.com/api/docs/pricing'
const anthNews = 'https://www.anthropic.com/news/models'
const g56 = 'https://openai.com/index/gpt-5-6/'
const g6 = 'https://openai.com/index/introducing-gpt-6-sol-and-luna/'
const g62 = 'https://openai.com/index/introducing-gpt-6-2-astra-sol/'
export const prices = {}
function add(id, lab, source, rates, releaseDate = null, releaseSource = null) {
  const [input = null, output = null, cachedRead = null, cachedWrite = null] = rates
  prices[id] = {lab, source, readDate: '2026-11-18', releaseDate, releaseSource,
    usdPerMillion: {input, output, thinking: output, cachedRead, cachedWrite,
      cachedWriteLong: lab === 'Anthropic' && input !== null ? input*2 : lab === 'OpenAI' ? input*2.5 : null}}
}
for (const [id, input, output, date] of [
  ['fable-5-2',8,40,'2026-11-09'], ['haiku-5-5',.1,.5,'2026-10-07'],
  ['opus-4-8',5,25,'2026-05-28'], ['opus-5-5',4,20,'2026-09-22'],
  ['sonnet-4-6',3,15,'2026-02-17'], ['sonnet-5-5',2,10,'2026-09-28'],
]) add('claude-'+id,'Anthropic',claude,[input,output,({'fable-5-2':.2,'opus-5-5':.2,'sonnet-5-5':.1})[id] ?? input/10,input*1.25],date,
  id === 'sonnet-4-6' ? 'https://www.anthropic.com/news/claude-sonnet-4-6' : anthNews)
for (const [id, input, output, read, date, release] of [
  ['5.6-sol',5,30,.5,'2026-07-09',g56], ['5.6-terra',2,12,.2,'2026-07-09',g56], ['5.6-luna',.2,1.2,.02,'2026-07-09',g56],
  ['6-astra',10,50,1,'2026-09-03','https://openai.com/index/gpt-6-astra/'],
  ['6-sol',2,10,.2,'2026-09-22',g6], ['6-luna',.1,.5,.01,'2026-09-22',g6],
  ['6.1-sol',2,10,.1,'2026-09-29','https://openai.com/index/introducing-gpt-6-1-sol/'],
  ['6.1-terra',1,5,.05,'2026-10-26','https://openai.com/index/introducing-gpt-6-1-terra/'],
  ['6.2-astra',8,40,.4,'2026-11-17',g62], ['6.2-sol',2,10,.1,'2026-11-17',g62],
]) add('gpt-'+id,'OpenAI',id === '5.6-sol' ? g56 : id.startsWith('5.6') ? 'https://developers.openai.com/api/docs/models/gpt-'+id : openai,[input,output,read,input*1.25],date,release)
add('composer-2.5','Cursor','https://cursor.com/docs/models/cursor-composer-2-5',[.5,2.5,.2],'2026-05-18','https://cursor.com/changelog/composer-2-5')
add('grok-4.6','xAI','https://docs.x.ai/developers/pricing',[2,6,.5],'2026-08-12','https://x.ai/news/grok-4-6')

// Lineup entries without a published Piece still have a sourced price record.
add('gemini-4-argon','Google','https://ai.google.dev/gemini-api/docs/pricing',[4,20,.2],'2026-10-13','https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-4-argon/')
add('grok-4.7','xAI','https://docs.x.ai/developers/pricing',[2,6,.5],'2026-09-21','https://x.ai/news/grok-4-7')
add('deepseek-v4-pro','DeepSeek','https://api-docs.deepseek.com/quick_start/pricing/',[1.32,3.96,.044],'2026-08-13','https://api-docs.deepseek.com/news/news260813/')
add('qwen4-max','Alibaba','https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/market/detail/qwen4-max',[1.5,4.5,.075,1.875],'2026-11-16','https://www.alibabacloud.com/help/en/model-studio/token-plan-product-updates')
add('kimi-k3.1-pro','Moonshot AI','https://platform.kimi.ai/',[2,10,.2,2],'2026-10-24','https://www.kimi.com/news/kimi-k3-1-pro')
add('glm-5.3','Z.ai','https://docs.z.ai/guides/overview/pricing',[1.4,4.4,.26],'2026-08-18','https://docs.z.ai/release-notes/new-released')
add('hy4','Tencent','https://www-sg.tencentcloud.com/document/product/1300/78937',[.834,2.501,.042])
add('minimax-m3','MiniMax','https://platform.minimax.io/docs/pricing/overview',[.3,1.2,.06],'2026-06-01','https://www.minimax.io/blog/minimax-m3')
add('mimo-v2.6-pro','Xiaomi','https://mimo.mi.com/docs/price',[.435,.87,.0036])
add('muse-spark-1.3-contributor','Meta','https://dev.meta.ai/docs/pricing-rate-limits',[.1,.2,.002])
add('nemotron-3.5-lightning','NVIDIA','https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard',[],'2026-08-11','https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard')

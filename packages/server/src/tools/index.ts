export { computerSchema, registerComputerTool } from './computer.js'
export type { ComputerArgs } from './computer.js'

export { navigateSchema, registerNavigateTool } from './navigate.js'
export type { NavigateArgs } from './navigate.js'

export {
  resizeWindowSchema,
  registerResizeWindowTool,
} from './resize_window.js'
export type { ResizeWindowArgs } from './resize_window.js'

export {
  readPageSchema,
  registerReadPageTool,
  findSchema,
  registerFindTool,
  javascriptToolSchema,
  registerJavascriptTool,
  formInputSchema,
  registerFormInputTool,
  getPageTextSchema,
  registerGetPageTextTool,
  clickElementSchema,
  registerClickElementTool,
  scrollElementSchema,
  registerScrollElementTool,
  fillElementSchema,
  registerFillElementTool,
  getElementInfoSchema,
  registerGetElementInfoTool,
  waitForElementSchema,
  registerWaitForElementTool,
} from './dom.js'
export type {
  ReadPageArgs,
  FindArgs,
  JavascriptToolArgs,
  FormInputArgs,
  GetPageTextArgs,
  ClickElementArgs,
  ScrollElementArgs,
  FillElementArgs,
  GetElementInfoArgs,
  WaitForElementArgs,
} from './dom.js'

export {
  readConsoleMessagesSchema,
  registerReadConsoleMessagesTool,
  readNetworkRequestsSchema,
  registerReadNetworkRequestsTool,
  getResponseBodySchema,
  registerGetResponseBodyTool,
} from './monitoring.js'
export type {
  ReadConsoleMessagesArgs,
  ReadNetworkRequestsArgs,
  GetResponseBodyArgs,
} from './monitoring.js'

export {
  tabsContextSchema,
  registerTabsContextTool,
  tabsCreateSchema,
  registerTabsCreateTool,
  tabsContextMcpSchema,
  registerTabsContextMcpTool,
  tabsCreateMcpSchema,
  registerTabsCreateMcpTool,
  tabsActivateSchema,
  registerTabsActivateTool,
  tabsCloseSchema,
  registerTabsCloseTool,
} from './tabs.js'
export type {
  TabsContextArgs,
  TabsCreateArgs,
  TabsContextMcpArgs,
  TabsCreateMcpArgs,
  TabsActivateArgs,
  TabsCloseArgs,
} from './tabs.js'

export {
  fileUploadSchema,
  registerFileUploadTool,
  uploadImageSchema,
  registerUploadImageTool,
} from './files.js'
export type {
  FileUploadArgs,
  UploadImageArgs,
} from './files.js'

export {
  gifCreatorSchema,
  registerGifCreatorTool,
  shortcutsListSchema,
  registerShortcutsListTool,
  shortcutsExecuteSchema,
  registerShortcutsExecuteTool,
} from './misc.js'
export type {
  GifCreatorArgs,
  ShortcutsListArgs,
  ShortcutsExecuteArgs,
} from './misc.js'

export {
  browsersContextSchema,
  registerBrowsersContextTool,
} from './browsers.js'
export type { BrowsersContextArgs } from './browsers.js'

export {
  agentDoneSchema,
  registerAgentDoneTool,
} from './agent_done.js'
export type { AgentDoneArgs } from './agent_done.js'

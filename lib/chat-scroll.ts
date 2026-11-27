type ChatScrollPosition = Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">;
type ChatScroller = ChatScrollPosition & {
  scrollTo: (options: ScrollToOptions) => void;
};

export function isCloseToChatEnd(view: ChatScrollPosition) {
  return view.scrollHeight - view.scrollTop - view.clientHeight < 48;
}

export function syncChatEnd(view: ChatScroller, following: boolean, roomChanged: boolean) {
  if (!roomChanged && !following) return false;
  view.scrollTo({ top: view.scrollHeight, behavior: "instant" });
  return true;
}

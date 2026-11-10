// Chat workspace (desktop): every word the history sidebar, its menu, the delete confirmations, the empty states and the .md export show.
// One table of [vi, en] pairs, split into the two locale maps the dictionary merge expects. Keys are prefixed `chatWs.`.
// Placeholders use {name}; translate() fills them.

const T: Record<string, [string, string]> = {
  'chatWs.rail.label': ['Điều hướng chính', 'Main navigation'],
  'chatWs.sidebar.title': ['Lịch sử trò chuyện', 'Chat history'],
  'chatWs.sidebar.newChat': ['Cuộc trò chuyện mới', 'New chat'],
  'chatWs.search.placeholder': ['Tìm trong tiêu đề và tin nhắn...', 'Search titles and messages...'],
  'chatWs.loading': ['Đang tải…', 'Loading…'],
  'chatWs.untitled': ['Cuộc trò chuyện mới', 'New conversation'],

  'chatWs.group.today': ['Hôm nay', 'Today'],
  'chatWs.group.sevenDays': ['7 ngày qua', 'Last 7 days'],
  'chatWs.group.older': ['Cũ hơn', 'Older'],

  'chatWs.select.on': ['Chọn', 'Select'],
  'chatWs.select.done': ['Xong', 'Done'],
  'chatWs.select.title': ['Chọn nhiều cuộc trò chuyện để xóa cùng lúc', 'Select several conversations to delete at once'],
  'chatWs.select.count': ['Đã chọn {n} hội thoại', '{n} selected'],
  'chatWs.select.cancel': ['Hủy chọn', 'Clear selection'],
  'chatWs.select.delete': ['Xóa hàng loạt', 'Delete selected'],

  'chatWs.menu.open': ['Tùy chọn', 'Options'],
  'chatWs.menu.rename': ['Đổi tên', 'Rename'],
  'chatWs.menu.export': ['Xuất cuộc trò chuyện (.md)', 'Export conversation (.md)'],
  'chatWs.menu.delete': ['Xóa vĩnh viễn…', 'Delete permanently…'],

  'chatWs.rename.hint': ['Nhấp đúp để đổi tên', 'Double-click to rename'],
  'chatWs.rename.saved': ['Đã đổi tên cuộc trò chuyện', 'Conversation renamed'],
  'chatWs.rename.empty': ['Tiêu đề không được để trống — đã giữ tên cũ', 'The title cannot be empty — the old name was kept'],
  'chatWs.rename.failed': ['Không đổi được tên. Hãy thử lại.', 'Could not rename. Please try again.'],

  'chatWs.delete.title': ['Xóa vĩnh viễn cuộc trò chuyện?', 'Delete this conversation permanently?'],
  'chatWs.delete.body': ['Cuộc trò chuyện {title} và toàn bộ tin nhắn sẽ bị xóa. Không thể khôi phục.', 'The conversation {title} and all its messages will be deleted. This cannot be undone.'],
  'chatWs.delete.batchTitle': ['Xóa vĩnh viễn {n} cuộc trò chuyện?', 'Delete {n} conversations permanently?'],
  'chatWs.delete.batchBody': ['Toàn bộ tin nhắn của các cuộc trò chuyện này sẽ bị xóa. Không thể khôi phục.', 'All messages in these conversations will be deleted. This cannot be undone.'],
  'chatWs.delete.confirm': ['Xác nhận xóa vĩnh viễn', 'Delete permanently'],
  'chatWs.delete.cancel': ['Hủy bỏ', 'Cancel'],
  'chatWs.delete.done': ['Đã xóa {n} cuộc trò chuyện', 'Deleted {n} conversation(s)'],
  'chatWs.delete.failed': ['Không xóa được. Hãy thử lại.', 'Could not delete. Please try again.'],

  'chatWs.export.done': ['Đã xuất {file}', 'Exported {file}'],
  'chatWs.export.you': ['Bạn', 'You'],
  'chatWs.export.tappy': ['Tappy', 'Tappy'],
  'chatWs.export.from': ['Xuất từ TappyAI', 'Exported from TappyAI'],
  'chatWs.export.count': ['{n} tin nhắn', '{n} messages'],

  'chatWs.empty.none.title': ['Chưa có cuộc trò chuyện nào', 'No conversations yet'],
  'chatWs.empty.none.desc': ['Bắt đầu một cuộc trò chuyện mới để Tappy giúp bạn lên kế hoạch, tìm địa điểm hoặc nghiên cứu chuyên sâu.', 'Start a new chat and Tappy will help you plan, find places or research in depth.'],
  'chatWs.empty.none.action': ['Bắt đầu cuộc trò chuyện', 'Start a chat'],
  'chatWs.empty.search.title': ['Không tìm thấy kết quả', 'No results'],
  'chatWs.empty.search.desc': ['Không có cuộc trò chuyện nào khớp với "{q}". Thử từ khóa khác hoặc gõ không dấu (ví dụ: "da lat").', 'No conversation matches "{q}". Try another keyword.'],
  'chatWs.empty.search.action': ['Xóa tìm kiếm', 'Clear search'],

  'chatWs.signin.title': ['Đăng nhập để xem lịch sử', 'Sign in to see your history'],
  'chatWs.signin.desc': ['Lịch sử trò chuyện được lưu theo tài khoản của bạn.', 'Your chat history is saved to your account.'],
  'chatWs.signin.action': ['Đăng nhập', 'Sign in'],

  'chatWs.error.load': ['Không tải được lịch sử trò chuyện.', 'Could not load your chat history.'],
  'chatWs.error.retry': ['Thử lại', 'Try again'],
}

export const vi: Record<string, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]))
export const en: Record<string, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]))

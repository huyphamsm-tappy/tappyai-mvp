// NEXT_PUBLIC_SHELL_REF (14/11/2026, default OFF): the chat workspace's OUTER shell drawn as the owner's first layout (menu button, logo, bell, avatar; a rail of Chat / Khám phá / Đã lưu / Inbox /
// Ứng dụng under a round "+"; the history panel that the menu opens and closes; a night-sky ground). It needs the mockup look it builds on. The conversation inside is not part of it.
import { V206_LOOK } from './v206Look'

export const SHELL_REF = process.env.NEXT_PUBLIC_SHELL_REF === '1' && V206_LOOK

// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import type { ComponentType } from 'react';
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  Scaling,
  RotateCw,
  Search,
  LayoutGrid,
  List,
  Hand,
  Maximize,
  Minimize,
  BookOpen,
  Sun,
  Moon,
  X,
  Eye,
  Pencil,
  MessageSquareText,
  Check,
  Columns2,
  MousePointer2,
  Highlighter,
  Underline,
  Strikethrough,
  Waves,
  Paintbrush,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  StickyNote,
  MessageSquare,
  Copy,
  LayoutDashboard,
  Square,
  Circle,
  ArrowRight,
  Undo2,
  Redo2,
  Trash2,
  Menu,
  Download,
  Printer,
  FolderOpen,
  Info,
  TriangleAlert,
  Signature,
  PenTool,
  Keyboard,
  RefreshCw,
  Image as ImageLucide,
  RectangleHorizontal,
  User,
  type LucideProps,
} from 'lucide-react';

type Glyph = ComponentType<LucideProps>;

export type IconName =
  | 'lock'
  | 'prev'
  | 'next'
  | 'dropdown'
  | 'zoomin'
  | 'zoomout'
  | 'fit-width'
  | 'fit-page'
  | 'rotate'
  | 'search'
  | 'thumbs'
  | 'toc'
  | 'hand'
  | 'fullscreen'
  | 'exit-fullscreen'
  | 'presentation'
  | 'sun'
  | 'moon'
  | 'close'
  | 'view'
  | 'edit'
  | 'suggest'
  | 'check'
  | 'two-page'
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'squiggly'
  | 'ink'
  | 'free-text'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'note'
  | 'comments'
  | 'copy'
  | 'organize'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'undo'
  | 'redo'
  | 'trash'
  | 'menu'
  | 'download'
  | 'print'
  | 'open'
  | 'info'
  | 'warning'
  | 'sign'
  | 'draw'
  | 'keyboard'
  | 'refresh'
  | 'image'
  | 'redact'
  | 'text-tool'
  | 'user'
  | 'eye'
  | 'pencil'
  | 'marker'
  | 'strikeout'
  | 'square'
  | 'circle'
  | 'thumbnails'
  | 'outline'
  | 'cursor'
  | 'chevron-left'
  | 'chevron-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'spread'
  | 'scroll-h'
  | 'fullscreen-enter'
  | 'fullscreen-exit';

const MAP: Record<IconName, Glyph> = {
  lock: Lock,
  prev: ChevronLeft,
  next: ChevronRight,
  dropdown: ChevronDown,
  zoomin: ZoomIn,
  zoomout: ZoomOut,
  'fit-width': MoveHorizontal,
  'fit-page': Scaling,
  rotate: RotateCw,
  search: Search,
  thumbs: LayoutGrid,
  toc: List,
  hand: Hand,
  fullscreen: Maximize,
  'exit-fullscreen': Minimize,
  presentation: BookOpen,
  sun: Sun,
  moon: Moon,
  close: X,
  view: Eye,
  edit: Pencil,
  suggest: MessageSquareText,
  check: Check,
  'two-page': Columns2,
  select: MousePointer2,
  highlight: Highlighter,
  underline: Underline,
  strike: Strikethrough,
  squiggly: Waves,
  ink: Paintbrush,
  'free-text': Type,
  'align-left': AlignLeft,
  'align-center': AlignCenter,
  'align-right': AlignRight,
  note: StickyNote,
  comments: MessageSquare,
  copy: Copy,
  organize: LayoutDashboard,
  rect: Square,
  ellipse: Circle,
  arrow: ArrowRight,
  undo: Undo2,
  redo: Redo2,
  trash: Trash2,
  menu: Menu,
  download: Download,
  print: Printer,
  open: FolderOpen,
  info: Info,
  warning: TriangleAlert,
  sign: Signature,
  draw: PenTool,
  keyboard: Keyboard,
  refresh: RefreshCw,
  image: ImageLucide,
  redact: RectangleHorizontal,
  'text-tool': Type,
  user: User,
  eye: Eye,
  pencil: Pencil,
  marker: Highlighter,
  strikeout: Strikethrough,
  square: Square,
  circle: Circle,
  thumbnails: LayoutGrid,
  outline: List,
  cursor: MousePointer2,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  spread: BookOpen,
  'scroll-h': Columns2,
  'fullscreen-enter': Maximize,
  'fullscreen-exit': Minimize,
};

interface IconProps {
  name: IconName;
  /** Active/selected toggle → a slightly heavier stroke (the violet bg cues state too). */
  filled?: boolean;
  /** Rendered glyph size in px. Default 20 (desktop-toolbar standard). */
  size?: number;
  className?: string;
}

export function Icon({ name, filled, size = 20, className }: IconProps) {
  const Glyph = MAP[name] || MAP.info;
  return <Glyph size={size} strokeWidth={filled ? 2.4 : 1.9} className={className} aria-hidden />;
}

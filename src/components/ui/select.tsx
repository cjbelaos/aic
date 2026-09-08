"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon, SearchIcon } from "lucide-react"

/* ─────────────────────────────────────────────────────────────────────────
 * Searchable Select — every dropdown gets a built-in filter box with zero
 * call-site changes.
 *
 * SelectContent renders a search <input> at the top of the list and exposes
 * the current query through context. SelectItem consumes that context and
 * hides itself when the query does not match its label text or value, and
 * reports visibility so the content can show a "No results found." state.
 *
 * Opt out on an individual dropdown with: <SelectContent searchable={false}>
 *
 * Positioning: we default to Radix's "popper" mode, which anchors the popup
 * to the trigger. The alternative "item-aligned" mode anchors the popup to
 * the selected item's text, so hiding filtered items re-measures the list and
 * re-anchors the whole popup — making the search box visibly jump around on
 * every keystroke. Popper keeps the popup (and search box) locked to the
 * trigger while the list filters. Pass position="item-aligned" explicitly if
 * you intentionally want item-aligned behavior on a non-searchable dropdown.
 * ───────────────────────────────────────────────────────────────────────── */

type SelectSearchContextValue = {
  /** Normalized (trimmed + lowercased) search term. Empty = no filtering. */
  query: string
  /** Items report whether they currently match so the content can render
   *  a "No results found." state when everything is filtered out. */
  setItemVisible: (value: string, visible: boolean) => void
}

const SelectSearchContext = React.createContext<SelectSearchContextValue | null>(
  null,
)

function textFromChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : "",
    )
    .join(" ")
    .trim()
}

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  searchable = true,
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
}) {
  const [query, setQuery] = React.useState("")
  const [visibleItems, setVisibleItems] = React.useState<Set<string>>(
    () => new Set(),
  )
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // Radix keeps focus on the trigger when the list opens (its onMountAutoFocus
  // is prevented), so move focus into the search box ourselves. If the box
  // were not focused, keystrokes would hit the trigger and trigger typeahead.
  React.useLayoutEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  const setItemVisible = React.useCallback(
    (value: string, visible: boolean) => {
      setVisibleItems((prev) => {
        const next = new Set(prev)
        if (visible) next.add(value)
        else next.delete(value)
        return next
      })
    },
    [],
  )

  const queryNorm = query.trim().toLowerCase()
  const noResults = queryNorm !== "" && visibleItems.size === 0

  const contextValue = React.useMemo(
    () => ({ query: queryNorm, setItemVisible }),
    [queryNorm, setItemVisible],
  )

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn("relative z-50 flex max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) flex-col overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectSearchContext.Provider value={contextValue}>
          {searchable && (
            <div
              data-slot="select-search"
              className="flex items-center gap-2 border-b px-2 pb-2 pt-1.5"
            >
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchInputRef}
                role="searchbox"
                aria-label={searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                onKeyDown={(event) => {
                  // Let Escape bubble up so the DismissableLayer closes the
                  // dropdown (same as before).
                  if (event.key === "Escape") return
                  // Swallow everything else so Radix's typeahead / arrow-key
                  // navigation cannot steal keystrokes from the search box.
                  event.stopPropagation()
                }}
                onWheel={(event) => {
                  // A focused text input swallows mouse-wheel and does not
                  // scroll the options viewport (confirmed browser behavior).
                  // Forward the wheel delta to the SelectPrimitive.Viewport.
                  if (document.activeElement !== event.currentTarget) return
                  const content = event.currentTarget.closest(
                    '[data-slot="select-content"]',
                  )
                  const viewport = content?.querySelector(
                    "[data-radix-select-viewport]",
                  )
                  if (
                    viewport &&
                    viewport.scrollHeight > viewport.clientHeight
                  ) {
                    viewport.scrollTop += event.deltaY
                  }
                }}
                className="placeholder:text-muted-foreground flex h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
          )}

          {noResults ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <SelectPrimitive.Viewport
              data-position={position}
              className={cn(
                "data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width) data-[position=popper]:max-h-(--radix-select-content-available-height)",
                "min-h-0 overflow-y-auto overscroll-contain",
                position === "popper" && ""
              )}
            >
              {children}
            </SelectPrimitive.Viewport>
          )}
        </SelectSearchContext.Provider>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const search = React.useContext(SelectSearchContext)
  const value = props.value ?? ""

  const hidden = React.useMemo(() => {
    if (!search || search.query === "") return false
    const label = textFromChildren(children)
    return (
      !value.toLowerCase().includes(search.query) &&
      !label.toLowerCase().includes(search.query)
    )
  }, [search?.query, value, children])

  React.useLayoutEffect(() => {
    if (!search) return
    search.setItemVisible(value, !hidden)
    return () => search.setItemVisible(value, false)
  }, [search, value, hidden])

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      hidden={hidden || undefined}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

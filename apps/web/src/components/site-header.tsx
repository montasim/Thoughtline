import { ArrowUpRightIcon, MenuIcon } from 'lucide-react';

import { BrandMark } from '#/components/brand-mark';
import { Button } from '#/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet';

const releaseUrl = 'https://github.com/montasim/Thoughtline/releases/latest';

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#privacy', label: 'Privacy' },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/50 bg-background/85 backdrop-blur-xl">
      <nav
        className="page-shell flex h-[72px] items-center justify-between"
        aria-label="Primary navigation"
      >
        <a href="#top" className="flex items-center gap-3" aria-label="Thoughtline home">
          <BrandMark className="size-9 shadow-sm" />
          <span className="font-display text-xl font-bold tracking-[-0.02em]">Thoughtline</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Button asChild size="sm" className="hidden md:inline-flex">
          <a href={releaseUrl} target="_blank" rel="noreferrer">
            Get the extension <ArrowUpRightIcon />
          </a>
        </Button>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader className="border-b pr-14">
              <SheetTitle className="flex items-center gap-3">
                <BrandMark className="size-9" /> Thoughtline
              </SheetTitle>
              <SheetDescription>Find the thought. Shape the words.</SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col px-3 py-4" aria-label="Mobile navigation">
              {links.map((link) => (
                <SheetClose asChild key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-xl px-3 py-3.5 font-semibold hover:bg-muted"
                  >
                    {link.label}
                  </a>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto p-4">
              <Button asChild className="w-full">
                <a href={releaseUrl} target="_blank" rel="noreferrer">
                  Get the extension <ArrowUpRightIcon />
                </a>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}

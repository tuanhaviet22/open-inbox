// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * The deployment's logo. It is read from `/brand/logo.svg`, so a deployment can
 * brand the app by replacing that file (and `favicon.svg` / `favicon.ico`)
 * without touching code. Decorative: the page heading carries the meaning.
 */
export default function BrandLogo({ className = "h-8 w-auto" }: { className?: string }) {
	return <img src="/brand/logo.svg" alt="" aria-hidden="true" className={className} />;
}

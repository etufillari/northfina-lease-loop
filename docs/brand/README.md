# Lease Loop wordmark

The infinity symbol replaces the two lowercase o letters in **Lease Loop**. The
header and footer share `BrandWordmark`, which keeps the remaining letters as live
text and exposes the full translated brand name to assistive technology. The app
icon uses a simplified vector infinity for small browser tabs.

[Approved visual reference](wordmark-reference.png) shows the design direction;
it is an image-generation concept, not a browser screenshot. The concept and the
transparent mark in `public/brand/lease-loop-infinity.png` were generated during
development and approved by the user. They are static assets; the application
does not call an image-generation or other AI service.

The component uses Next.js image optimization for the small mark, with an SVG
viewport framing the transparent artwork. If the source artwork changes, update
the viewport and source dimensions together. It takes the accessible name from
the existing `brand.name` translation, leaving ordinary text mentions and page
titles readable as Lease Loop.

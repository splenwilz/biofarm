# Biofarm Communications Repository

Marketing and communications assets for **Biofarm**, a company delivering fully managed, off-site Biodiversity Net Gain (BNG) solutions by transforming unproductive land in England into thriving, lasting habitats.

## Table of Contents

- [About Biofarm](#about-biofarm)
- [Project Structure](#project-structure)
- [Brand Guidelines](#brand-guidelines)
- [Newsletter Templates](#newsletter-templates)
- [Assets](#assets)
- [Development Setup](#development-setup)
- [Email Deliverability](#email-deliverability)
- [Links](#links)

## About Biofarm

Biofarm delivers Biodiversity Net Gain (BNG) solutions to developers, landowners, and local authorities across England. Our habitat banks restore degraded land into thriving ecosystems while enabling sustainable development.

**Key Achievements (2025):**
- 4 new habitat banks established
- 175 acres restored
- 15 red list species supported

## Project Structure

```
biofarm/
├── BIOFARM_BRAND_GUIDELINES/      # Brand identity documents (54 pages)
├── january/                        # January newsletter materials
│   ├── january-newsletter.html     # Main newsletter
│   ├── Email Newsletter Comms/     # Design reference (PDF/JPG)
│   ├── January Newsletter - Imagery/
│   ├── EMAIL_DELIVERABILITY_GUIDE.md
│   └── wetransfer_.../             # Social media videos (4 MP4s)
├── february/                       # February newsletter materials
│   ├── february-newsletter.html    # Main newsletter
│   ├── Email Newsletter Comms/     # Design reference
│   └── February Comms/
│       ├── Brand Assets/           # Illustrated characters (7 PNGs)
│       ├── Copy/                   # Content documents
│       └── Imagery/                # Newsletter imagery
└── .vscode/                        # VS Code settings
```

## Brand Guidelines

### Colors

| Color       | Hex Code  | Usage                          |
|-------------|-----------|--------------------------------|
| Cream       | `#F5F6F1` | Primary background             |
| Charcoal    | `#212121` | Headers, text                  |
| Muted Green | `#71977A` | CTAs, accents, section headers |
| White       | `#FFFFFF` | Alternating sections           |

### Typography

| Font                  | Weight      | Usage              |
|-----------------------|-------------|--------------------|
| Bauhaus Rati Display  | Regular     | Display headings   |
| Inter                 | 200-300     | Body text, subheads|

**Typography Styles:**
- Headings: `font-weight: 200`, `letter-spacing: -0.02em`
- Body: `font-weight: 300`, `line-height: 1.6`

## Newsletter Templates

### Structure

Each newsletter follows a consistent structure:

1. **Header** - Logo with decorative character on dark background
2. **Hero Section** - Featured video or image
3. **CEO Message** - Leadership introduction with portrait
4. **Story Sections** - 3-4 content blocks with alternating backgrounds
5. **Educational Block** - "Did You Know?" wildlife facts
6. **CTA Section** - Call-to-action for engagement
7. **Footer** - Social links, company description, legal compliance

### Technical Specifications

- **Format**: HTML5 email with Microsoft Office compatibility
- **Responsive**: Mobile-first with media queries (`max-width: 600px`)
- **Email Client Support**:
  - MSO (Microsoft Office) compatibility tags
  - Apple device meta tags
  - VML namespace support

### Example Section Pattern

```html
<tr>
  <td style="padding: 40px 30px; background-color: #F5F6F1;">
    <h2 style="font-family: 'Inter', sans-serif; font-weight: 200;">
      Section Title
    </h2>
    <p style="font-family: 'Inter', sans-serif; font-weight: 300; line-height: 1.6;">
      Content...
    </p>
  </td>
</tr>
```

## Assets

### Newsletters
- `january/january-newsletter.html` - December Stories from the Ground
- `february/february-newsletter.html` - February Stories from the Ground

### Imagery
- Habitat bank photography (Avon Meadows, Lesnewth)
- Partnership and conference images
- Wildlife photography

### Brand Assets
Illustrated characters for storytelling:
- Bee, Lapwing, Crane, Fern
- Breeze Block, Wellington, Longhorn Cattle

### Social Media
- Portrait-mode video clips (MP4)
- Optimized for social platforms

## Development Setup

### VS Code Configuration

The repository includes VS Code settings for consistent development:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "prettier.singleQuote": true,
  "prettier.semi": false,
  "prettier.tabWidth": 2,
  "prettier.trailingComma": "es5"
}
```

### Tools
- **ESLint** - JavaScript/TypeScript validation
- **Prettier** - Code formatting

## Email Deliverability

For email best practices including SPF, DKIM, DMARC authentication, and testing tools, see:

[`january/EMAIL_DELIVERABILITY_GUIDE.md`](january/EMAIL_DELIVERABILITY_GUIDE.md)

Key recommendations:
- Use professional email services (Mailchimp, SendGrid, Amazon SES)
- Include unsubscribe links for compliance
- Test with Mail-tester.com or GlockApps before sending

## Links

- **Website**: [biofarm.co.uk](https://biofarm.co.uk)
- **LinkedIn**: [linkedin.com/company/biofarm](https://linkedin.com/company/biofarm)
- **Twitter**: [twitter.com/biofarm](https://twitter.com/biofarm)

---

*Biofarm - Transforming land, restoring nature, enabling development.*

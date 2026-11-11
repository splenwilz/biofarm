"""Build the two Lesnewth event invites (24 Nov 2026) for Pipedrive Campaigns.

    python3 november/build_invites.py --crs-email X --cs-email Y

Same approved copy in both (november/invite-copy.txt); only the sender,
sign-off, RSVP address and utm_content differ. Two photographs, hosted on tasknify:
the aerial as hero and the landowners beside the programme (Vix, 10 Nov: strip it back,
no illustrations, one or two photos max).
"""
import argparse
import os
import urllib.parse as up

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMG = "https://tasknify.com/biofarms/November%20Emails%20-%20Imagery/"
LOGO = ("https://images.squarespace-cdn.com/content/v1/6818f9d9bff1414041f33bf3/"
        "c7573182-d51f-41b5-a896-77f06f8d5496/Asset+10LOGO.png?format=500w")
CAMPAIGN = "lesnewth-event-nov-2026"
SITE = "https://www.biofarm.co.uk"
SUBJECT = "BNG in action at Lesnewth | Invitation & agenda | 24 November"
PREHEADER = ("Tuesday 24 November, 10.30am&ndash;1.00pm at Lesnewth Habitat Bank, Boscastle. "
             "Walk the site with the Biofarm team and our landowners, Simon and Natasha.")

ADDRESS = "Old Rectory, Lesnewth, Boscastle, PL35 0HR"
MAP_URL = "https://www.google.com/maps/search/?api=1&query=" + up.quote(ADDRESS)
CAL_URL = "https://calendar.google.com/calendar/render?" + up.urlencode({
    "action": "TEMPLATE",
    "text": "BNG in action at Lesnewth | Biofarm",
    "dates": "20261124T103000/20261124T130000",
    "ctz": "Europe/London",
    "location": ADDRESS,
    "details": ("A morning at Lesnewth Habitat Bank with the Biofarm team and landowners "
                "Simon and Natasha. 10.30am welcome and introductions, 11.00am BNG in action "
                "walk and discussion, optional lunch from 1.00pm."),
})

VERSIONS = [
    {
        "file": "lesnewth-invite-landowners.html",
        "sender": "Chris Rowland-Smith",
        "title": "Land Director",
        "initials": "CRS",
        "content": "landowner",
        "email_arg": "crs_email",
    },
    {
        "file": "lesnewth-invite-lpa.html",
        "sender": "Chris Scott",
        "title": "Chief Commercial Officer",
        "initials": "CS",
        "content": "lpa",
        "email_arg": "cs_email",
    },
]

FONT_BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
FONT_HEAD = "'RATI', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"


def site(path, content, extra=""):
    q = f"utm_source=pipedrive&amp;utm_medium=email&amp;utm_campaign={CAMPAIGN}&amp;utm_content={content}"
    return f"{SITE}{path}?{q}{extra}"


def p(text, mb=16, size=16):
    return (f'<p style="font-size: {size}px; line-height: 1.6; margin: 0 0 {mb}px 0; color: #000; '
            f'font-family: {FONT_BODY}; text-align: left;">{text}</p>')


def eyebrow(text):
    return (f'<p class="eyebrow" style="font-size: 13px; line-height: 1.4; margin: 0 0 10px 0; color: #000; '
            f'font-family: {FONT_BODY}; text-align: left; letter-spacing: 0.08em; text-transform: uppercase;">{text}</p>')


def block(inner, pad="0 50px"):
    return f'''
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td style="padding: {pad}; text-align: left;" class="padding-mobile-both" valign="top">
{inner}
                      </td>
                    </tr>
                  </table>'''


def rule():
    return block('''<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                          <tr><td height="1" bgcolor="#A6B897" style="height: 1px; line-height: 1px; font-size: 1px; background-color: #A6B897;">&nbsp;</td></tr>
                        </table>''')


def button(href, label, pad="0 50px 10px 50px"):
    return f'''
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td align="center" style="padding: {pad};" class="padding-mobile-both">
                        <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                          <tr>
                            <td align="center" valign="middle" bgcolor="#000000" width="260" height="48" style="background-color: #000000; width: 260px; height: 48px;">
                              <a class="button-link" href="{href}" style="color: #f5f6f1; text-decoration: none; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; letter-spacing: 0.06em; display: block; width: 260px; height: 48px; line-height: 48px; text-align: center; mso-line-height-rule: exactly;"><font color="#f5f6f1" style="color: #f5f6f1; text-decoration: none;">{label}</font></a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>'''


def full_image(src, alt, w, h):
    return f'''
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td align="center" style="padding: 0;">
                        <img src="{src}" alt="{alt}" width="{w}" height="{h}" class="section-scaleable-image" style="display: block; border: 0; width: {w}px; max-width: 100%; height: auto;" />
                      </td>
                    </tr>
                  </table>'''


def inset_image(src, alt, w, h, pad="0 50px 30px 50px"):
    """Photo that keeps the body's side margins (494px wide at desktop)."""
    return f'''
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td align="center" style="padding: {pad};" class="padding-mobile-both">
                        <img src="{src}" alt="{alt}" width="{w}" height="{h}" class="section-scaleable-image" style="display: block; border: 0; width: {w}px; max-width: 100%; height: auto;" />
                      </td>
                    </tr>
                  </table>'''


def detail_row(label, value, last=False):
    pb = "0" if last else "10px"
    return f'''
                          <tr>
                            <td width="110" valign="top" style="padding: 0 10px {pb} 0; font-size: 13px; line-height: 1.6; letter-spacing: 0.08em; text-transform: uppercase; color: #000; font-family: {FONT_BODY};">{label}</td>
                            <td valign="top" class="detail" style="padding: 0 0 {pb} 0; font-size: 16px; line-height: 1.6; color: #000; font-family: {FONT_BODY};">{value}</td>
                          </tr>'''


def programme_item(time, title, text, last=False):
    pb = "0" if last else "30px"
    return f'''
                          <tr>
                            <td valign="top" style="padding: 0 0 {pb} 0;">
                              {p(f"<strong>{time}</strong>", mb=8, size=14)}
                              <h3 style="color: #000; margin: 0 0 10px; font-weight: 300; line-height: 1.3; font-size: 22px; font-family: {FONT_HEAD}; text-align: left;">{title}</h3>
                              {p(text, mb=0)}
                            </td>
                          </tr>'''


def render(v, rsvp_email):
    c = v["content"]
    rsvp_subject = up.quote(f"RSVP: BNG in action at Lesnewth, 24 November")
    rsvp_body = up.quote("I'd like to attend on Tuesday 24 November.\n\nStaying for lunch: yes / no\nDietary requirements: \n")
    rsvp_href = f"mailto:{rsvp_email}?subject={rsvp_subject}&amp;body={rsvp_body}"
    ink = f"id=\"lesnewth-invite\""

    opening = block(
        p("Hello,")
        + p("We&rsquo;re looking forward to welcoming you to Lesnewth Habitat Bank for a morning exploring how biodiversity net gain is taking shape in Cornwall.")
        + p("Together with our landowners, Simon and Natasha, we&rsquo;ll share what&rsquo;s happening at Lesnewth and explore how locally delivered BNG can help developers meet their planning requirements while supporting Cornwall&rsquo;s nature recovery priorities.")
        + p("It&rsquo;s a chance to get out on the land, exchange ideas and see the benefits of working together.", mb=0),
        pad="18px 50px 30px 50px")

    details = block(
        eyebrow("Event details")
        + '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">'
        + detail_row("Date", "<strong>Tuesday 24 November 2026</strong>")
        + detail_row("Time", "10.30am&ndash;1.00pm, with optional lunch afterwards")
        + detail_row("Location", f'Old Rectory, Lesnewth, Boscastle, PL35 0HR<br /><a class="inline-link" href="{MAP_URL}" style="color: #000000; text-decoration: underline;">View map</a>'
                     f' &nbsp;&middot;&nbsp; <a class="inline-link" href="{CAL_URL}" style="color: #000000; text-decoration: underline;">Add to calendar</a>', last=True)
        + '</table>',
        pad="26px 50px 30px 50px")

    programme = block(
        eyebrow("The morning&rsquo;s programme").replace("margin: 0 0 10px 0", "margin: 0 0 18px 0")
        + '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">'
        + programme_item("10.30&ndash;11.00am", "Welcome and introductions",
                         "Coffee, meet the Biofarm team and our landowners, Simon and Natasha, and hear about our plans for Lesnewth.")
        + programme_item("11.00am&ndash;1.00pm", "BNG in action",
                         "An interactive walk and discussion exploring the restoration underway, opportunities for local BNG delivery and the wider benefits for Cornwall.")
        + programme_item("From 1.00pm", "Lunch and conversation",
                         "For those who can stay, we&rsquo;d love you to join us for lunch and a chance to continue the conversation.", last=True)
        + '</table>',
        pad="26px 50px 30px 50px")

    closing = block(
        p("Please RSVP to confirm your attendance and, if staying for lunch, any dietary requirements.", mb=0),
        pad="30px 50px 22px 50px")

    reply_note = block(p("Or simply reply to this email.", mb=0, size=14), pad="0 50px 30px 50px")

    signoff = block(
        p("We look forward to seeing you there.")
        + p(f"<strong>{v['sender']}</strong><br />{v['title']}, Biofarm", mb=22)
        + p(f'<a class="inline-link" href="{site("/habitat-banks-lists/lesnewth", c)}" style="color: #000000; text-decoration: underline;">Find out more about Lesnewth Habitat Bank &rarr;</a>', mb=0, size=14),
        pad="0 50px 40px 50px")

    hero = full_image(IMG + "lesnewth-aerial.jpg", "Lesnewth Habitat Bank from the air: fields, Cornish hedges and the wooded valley", 594, 334)
    headline = f'''
                  <!-- HEADLINE -->
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td style="padding: 34px 50px 0 50px; text-align: left;" class="padding-mobile-both" valign="top">
                        {eyebrow("You&rsquo;re invited &nbsp;|&nbsp; Tuesday 24 November 2026")}
                        <h2 style="color: #000; margin: 0; font-weight: 300; line-height: 1.2; font-size: 34px; font-family: {FONT_HEAD}; letter-spacing: -0.01em; text-align: left;">BNG in action at Lesnewth</h2>
                      </td>
                    </tr>
                  </table>'''
    landowners = inset_image(IMG + "lesnewth-landowners-wide.jpg", "Simon and Natasha, the landowners at Lesnewth, out on the land", 494, 371, pad="0 50px 0 50px")
    return f'''<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>{SUBJECT.replace("&", "&amp;")}</title>
    <!-- LESNEWTH EVENT INVITE - {v['initials']} version ({v['content']} contacts). Built by november/build_invites.py; edit the script, not this file. -->
    <!--[if mso]>
      <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
      <style type="text/css">
        a, a:link, a:visited {{ color: #f5f6f1 !important; text-decoration: none !important; }}
        .button-link, .button-link:link, .button-link:visited {{ color: #f5f6f1 !important; text-decoration: none !important; }}
        td[bgcolor="#000000"] a {{ color: #f5f6f1 !important; text-decoration: none !important; }}
      </style>
    <![endif]-->
    <style>
      :root {{ color-scheme: light only; supported-color-schemes: light only; }}
      @font-face {{
        font-family: 'RATI';
        src: url('https://static1.squarespace.com/static/6818f9d9bff1414041f33bf3/t/6824c94beed6e10aa5f3a5c5/1747241291677/BauhausRatiDisplay-ExtraLight.otf') format('opentype');
        font-weight: 300; font-style: normal;
      }}
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400&display=swap');
      body, table, td, p, a, li {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
      table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
      img {{ -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
      html, body {{ margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }}
      .body, #lesnewth-invite, #lesnewth-invite table, #lesnewth-invite td, #lesnewth-invite img {{ max-width: 100% !important; }}
      #lesnewth-invite * {{ max-width: 100% !important; box-sizing: border-box !important; }}
      a, a:link, a:visited, a:hover, a:active {{ text-decoration: none !important; border-bottom: none !important; }}
      .button-link, .button-link:link, .button-link:visited, .button-link:hover, .button-link:active {{ text-decoration: none !important; color: #f5f6f1 !important; border-bottom: none !important; }}
      a.inline-link, a.inline-link:link, a.inline-link:visited {{ text-decoration: underline !important; color: #000000 !important; }}
      table a, td a {{ text-decoration: none !important; border-bottom: none !important; }}
      td[bgcolor="#000000"] a {{ text-decoration: none !important; color: #f5f6f1 !important; }}
      body, #lesnewth-invite, #lesnewth-invite td, #lesnewth-invite p, #lesnewth-invite a, #lesnewth-invite li {{ font-family: {FONT_BODY}; font-weight: 300; }}
      #lesnewth-invite h1, #lesnewth-invite h2, #lesnewth-invite h3, #lesnewth-invite h4 {{ font-family: {FONT_HEAD}; font-weight: 300; }}
      u + .body #lesnewth-invite {{ width: 100% !important; max-width: 594px !important; }}
      @media only screen and (max-width: 600px) {{
        #lesnewth-invite {{ width: 100% !important; }}
        #lesnewth-invite a.button-link, .button-link {{ line-height: 48px !important; }}
        .padding-mobile-both {{ padding-left: 20px !important; padding-right: 20px !important; }}
        img.section-scaleable-image {{ height: auto !important; width: 100% !important; }}
      }}
    </style>
  </head>
  <body class="body" style="margin: 0; padding: 0; background-color: #ffffff">
    <!--[if mso]><style type="text/css">body, table, td, p, a, li {{ font-family: Arial, sans-serif !important; }}</style><![endif]-->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff">
      <tr>
        <td align="center" style="padding: 20px 10px">
          <table style="margin: 0 auto; max-width: 594px" align="center" {ink} bgcolor="#F5F6F1" width="594" cellspacing="0" cellpadding="0" border="0">
            <tbody>
              <tr>
                <td valign="top" align="center">

                  <!-- Preheader -->
                  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">{PREHEADER}</div>

                  <!-- HEADER LOGO -->
                  <table border="0" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td align="center" style="padding: 40px 50px 20px 50px;" class="padding-mobile-both">
                        <a href="{site("/", c)}" style="display: inline-block; text-decoration: none;">
                          <img src="{LOGO}" alt="Biofarm" width="190" height="36" style="display: block; border: 0;" />
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- HERO PHOTO -->{hero}{headline}
                  <!-- OPENING -->{opening}
{rule()}
                  <!-- EVENT DETAILS -->{details}
{rule()}
                  <!-- PROGRAMME -->{programme}
                  <!-- THE LANDOWNERS -->{landowners}
                  <!-- CLOSING -->{closing}{button(rsvp_href, "RSVP")}{reply_note}
                  <!-- SIGNOFF -->{signoff}

                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crs-email", default=None, help="RSVP address for the Chris Rowland-Smith version")
    ap.add_argument("--cs-email", default=None, help="RSVP address for the Chris Scott version")
    args = ap.parse_args()
    for v in VERSIONS:
        email = getattr(args, v["email_arg"]) or "info@biofarm.co.uk"
        if not getattr(args, v["email_arg"]):
            print(f"WARNING: no --{v['email_arg'].replace('_', '-')} given; {v['file']} RSVP button points at info@biofarm.co.uk")
        path = os.path.join(OUT_DIR, v["file"])
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(render(v, email))
        print("wrote", path)


if __name__ == "__main__":
    main()

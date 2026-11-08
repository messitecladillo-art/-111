"""Whole-page artwork made with the user's report skills, kept in step with the frontend's lib/page-art.ts.

- The cover image (research-report-cover) is the cover page; no title is set over it.
- The frame image (research-report-frame) is a transparent A4 PNG behind every page after the cover.

The pixel size is read from the file's own header, never trusted from the draft; the page shape must be A4 portrait,
because an image is printed whole, edge to edge.
"""
import base64
import binascii
import re

from shared.errors import ApiError

LIMITS = {
    'cover': {'schema': 'CoverImage/v1', 'bytes': 1_000_000, 'mimes': ('image/jpeg', 'image/png')},
    'frame': {'schema': 'FrameImage/v1', 'bytes': 600_000, 'mimes': ('image/png',)},
}
MIN_WIDTH = 800
MAX_SIDE = 6000
ASPECT_TOLERANCE = 0.015
MAX_NOTE = 300
A4_ASPECT = 210 / 297
KEYS = {'schema', 'mime', 'data', 'widthPx', 'heightPx', 'note'}
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
FRAME_IMAGE_FILE = 'frame-image.png'


def image_size(data, mime):
    """The pixel size a PNG or JPEG states in its own header, or None."""
    if mime == 'image/png':
        if len(data) < 24 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b'IHDR':
            return None
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    if len(data) < 4 or data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = int.from_bytes(data[i + 2:i + 4], 'big')
        if length < 2:
            return None
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            return int.from_bytes(data[i + 7:i + 9], 'big'), int.from_bytes(data[i + 5:i + 7], 'big')
        i += 2 + length
    return None


def _art_bytes(value, kind):
    limits = LIMITS[kind]
    if not isinstance(value, dict) or set(value) != KEYS or value['schema'] != limits['schema']:
        raise ApiError()
    mime, data, note = value['mime'], value['data'], value['note']
    if mime not in limits['mimes'] or not isinstance(data, str) or len(data) > -(-limits['bytes'] // 3) * 4:
        raise ApiError()
    if not re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', data) or len(data) % 4:
        raise ApiError()
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError() from None
    if len(raw) > limits['bytes']:
        raise ApiError()
    size = image_size(raw, mime)
    width, height = value['widthPx'], value['heightPx']
    if not size or type(width) is not int or type(height) is not int or size != (width, height):
        raise ApiError()
    if width < MIN_WIDTH or max(width, height) > MAX_SIDE or abs(width / height / A4_ASPECT - 1) > ASPECT_TOLERANCE:
        raise ApiError()
    if not isinstance(note, str) or not note.strip() or len(note) > MAX_NOTE or re.search(r'[\x00-\x1f\x7f]', note):
        raise ApiError()
    return raw


def cover_image_bytes(value):
    """Validates a cover image and returns its decoded bytes."""
    return _art_bytes(value, 'cover')


def frame_image_bytes(value):
    """Validates a frame image and returns its decoded bytes."""
    return _art_bytes(value, 'frame')


def cover_image_file(value):
    """The file name the LaTeX source includes and the compiler writes next to it."""
    return 'cover-image.png' if value['mime'] == 'image/png' else 'cover-image.jpg'


def cover_image_titlepage(value):
    """The title page that prints the cover over the whole page; byte-identical with the frontend."""
    return [
        r'\begin{titlepage}',
        r'\begin{tikzpicture}[remember picture,overlay]',
        r'\node[inner sep=0pt] at (current page.center) {\includegraphics[width=\paperwidth,height=\paperheight]{' + cover_image_file(value) + '}};',
        r'\end{tikzpicture}',
        r'\end{titlepage}',
    ]


def frame_image_preamble():
    """Lays the frame image behind every page while \\ReportFrameImagetrue; byte-identical with the frontend."""
    return [
        r'\newif\ifReportFrameImage',
        r'\ReportFrameImagefalse',
        r'\AddToHook{shipout/background}{\ifReportFrameImage\begin{tikzpicture}[remember picture,overlay]\node[inner sep=0pt] at (current page.center) {\includegraphics[width=\paperwidth,height=\paperheight]{' + FRAME_IMAGE_FILE + r'}};\end{tikzpicture}\fi}',
    ]

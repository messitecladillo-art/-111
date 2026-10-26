"""Portable aggregate figures and controlled page frames for EditorContent/v3.

The contract checks references and bounded values, not the truth of client statistics.
No user SVG, executable templates, respondent arrays or arbitrary colour registries enter it.
"""
import math
import re
from shared.errors import ApiError
from shared.contracts import object_fields, text


# Mirrors CHART_THEMES. The cross-language registry test makes palette drift visible.
VISUAL_PALETTES = {
    'blue': ('#255D87', '#3C779E', '#5492B2', '#77ADC6', '#A0C8D7', '#C4E0E8'),
    'teal': ('#156B6B', '#278582', '#459C94', '#6CB5A7', '#9BCDBE', '#C6E2D4'),
    'forest': ('#38604A', '#527A59', '#709365', '#94AC80', '#B8C6A0', '#D5DEC2'),
    'plum': ('#615174', '#7D638C', '#997DA5', '#B49ABB', '#CDB9D0', '#E1D7E3'),
    'slate': ('#364A5A', '#526574', '#74838D', '#95A1A8', '#B7C0C5', '#D9DFE2'),
    'ref_zhihu_02': ('#A5AEB7', '#925EB0', '#7E99F4', '#CC7C71', '#7AB656'),
    'ref_zhihu_05': ('#DDDDDD', '#E6B745', '#D0DD97'),
    'ref_zhihu_07': ('#A51C36', '#7ABBDB', '#84BA42', '#682487', '#DBB428', '#D4562E', '#4485C7'),
    'ref_zhihu_14': ('#D8B365', '#5BB5AC', '#DE526C'),
    'ref_zhihu_19': ('#7EA6D9', '#D4E6BC', '#F8F2A4'),
    'ref_zhihu_26': ('#32183C', '#A21A54', '#E7724F', '#000000', '#36659E', '#40B7AD'),
    'ref_zhihu_28': ('#2B5863', '#6A8078', '#9D9D9D'),
    'ref_zhihu_31': ('#B6B3D6', '#DAD7E9', '#CFCFD0', '#FDE2D8', '#F58F7A', '#E9687A'),
    'ref_zhihu_31_warm': ('#FDE2D8', '#F58F7A', '#E9687A'),
}
FIGURE_KINDS = ('bar', 'horizontal_bar', 'grouped_bar', 'percent_stacked', 'heatmap', 'histogram', 'boxplot', 'table')
JS_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def _number(value, minimum=-1e12, maximum=1e12, integral=False):
    if type(value) not in (int, float):
        raise ApiError()
    try:
        valid = math.isfinite(value) and minimum <= value <= maximum and (not integral or value == math.trunc(value))
    except (OverflowError, ValueError):
        valid = False
    if not valid:
        raise ApiError()
    return value


def _text(value, maximum=300, required=False):
    text(value, maximum)
    if required and not value.strip(JS_WHITESPACE):
        raise ApiError()
    return value


def _list(value, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise ApiError()
    return value


def _hash(value):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value):
        raise ApiError()


def _visual_style(value):
    x = object_fields(value, ('schema', 'paletteId', 'version'))
    if x['schema'] != 'ProjectVisualStyle/v1' or not isinstance(x['paletteId'], str) or x['paletteId'] not in VISUAL_PALETTES:
        raise ApiError()
    _number(x['version'], 1, 9_007_199_254_740_991, True)
    return x


def _figure(value):
    f = object_fields(value, ('schema', 'id', 'resultId', 'resultHash', 'kind', 'title', 'xLabel', 'yLabel', 'note', 'n', 'labels', 'series', 'bins', 'boxes', 'table', 'style'))
    if f['schema'] != 'ReportFigure/v1' or f['kind'] not in FIGURE_KINDS:
        raise ApiError()
    for key in ('id', 'resultId'):
        _text(f[key], 80, True)
    _hash(f['resultHash'])
    _text(f['title'], 300, True)
    _text(f['xLabel']); _text(f['yLabel']); _text(f['note'], 2000)
    n = _number(f['n'], 0, 5000, True)
    labels = _list(f['labels'], 50)
    for label in labels:
        _text(label, 160)
    series = _list(f['series'], 20)
    for item in series:
        s = object_fields(item, ('name', 'values'))
        _text(s['name'], 160)
        values = _list(s['values'], 50)
        if len(values) != len(labels):
            raise ApiError()
        for v in values:
            if v is not None:
                _number(v)
    bins = _list(f['bins'], 50)
    for item in bins:
        b = object_fields(item, ('start', 'end', 'count'))
        if _number(b['end']) < _number(b['start']):
            raise ApiError()
        _number(b['count'], 0, 5000, True)
    if len(bins) > 1 and any(b['start'] == b['end'] for b in bins):
        raise ApiError()
    boxes = _list(f['boxes'], 20)
    for item in boxes:
        b = object_fields(item, ('label', 'low', 'q1', 'median', 'q3', 'high'))
        _text(b['label'], 160)
        values = [_number(b[key]) for key in ('low', 'q1', 'median', 'q3', 'high')]
        if any(v < values[i - 1] for i, v in enumerate(values) if i):
            raise ApiError()
    table = object_fields(f['table'], ('headers', 'rows'))
    headers = _list(table['headers'], 30)
    for header in headers:
        _text(header, 160)
    rows = _list(table['rows'], 400)
    for row in rows:
        if len(_list(row, 30)) != len(headers):
            raise ApiError()
        for cell in row:
            if cell is None:
                continue
            if type(cell) in (int, float):
                _number(cell)
            else:
                _text(cell, 2000)
    style = object_fields(f['style'], ('decimals', 'showLabels', 'showGrid', 'showBorder'))
    _number(style['decimals'], 0, 6, True)
    if any(type(style[key]) is not bool for key in ('showLabels', 'showGrid', 'showBorder')):
        raise ApiError()
    kind = f['kind']
    if kind == 'histogram' and (not bins or any(b['start'] != bins[i - 1]['end'] for i, b in enumerate(bins) if i) or sum(b['count'] for b in bins) != n):
        raise ApiError()
    if kind == 'boxplot' and not boxes or kind == 'table' and (not headers or not rows):
        raise ApiError()
    if kind not in ('histogram', 'boxplot', 'table') and (not labels or not series or not any(v is not None for s in series for v in s['values'])):
        raise ApiError()
    if kind == 'percent_stacked' and (any(v is None or v < 0 for s in series for v in s['values']) or any(sum(s['values'][i] for s in series) <= 0 for i in range(len(labels)))):
        raise ApiError()
    return f


def _frame(value, style):
    # The backend copy is generated from the canonical Skill by the integration build.
    from .report_frame_geometry import build_frame, FrameError
    try:
        build_frame(value)
        if value['paper'] != {'widthMm': 210, 'heightMm': 297} or value['marginsMm'] != {'top': 25.4, 'right': 31.8, 'bottom': 25.4, 'left': 31.8}:
            raise ApiError()
        palette = value['palette']
        if palette['id'] not in VISUAL_PALETTES:
            raise ApiError()
        colors = VISUAL_PALETTES[palette['id']]
        expected = {'primary': colors[0], 'secondary': colors[2 % len(colors)], 'accent': colors[4 % len(colors)]}
        if any(palette[key].upper() != color for key, color in expected.items()):
            raise ApiError()
        if value['status'] == 'approved' and (style is None or palette['id'] != style['paletteId'] or palette['version'] != style['version']):
            raise ApiError(422, 'frame_palette_stale', '页框配色版本已变化，请预览并重新应用。')
    except (FrameError, ValueError, TypeError, KeyError, OverflowError, UnicodeError):
        raise ApiError() from None


def validate_report_visuals(content):
    """Validate v3 additions without rewriting content, hashes or statistical confirmation."""
    if not isinstance(content, dict) or type(content.get('version')) is not int or content['version'] not in (1, 2, 3):
        raise ApiError()
    version = content['version']
    visual_keys = ('visualStyle', 'figures', 'reportFrame')
    if version != 3 and any(key in content for key in visual_keys):
        raise ApiError()
    style = _visual_style(content['visualStyle']) if 'visualStyle' in content else None
    figures = [_figure(value) for value in _list(content.get('figures', []), 120)]
    if len({f['id'] for f in figures}) != len(figures) or figures and style is None:
        raise ApiError()
    quality = content.get('quality', {})
    if not isinstance(quality, dict):
        raise ApiError()
    results = _list(quality.get('results', []), 120)
    if any(not isinstance(r, dict) for r in results):
        raise ApiError()
    by_result = {_text(r.get('id'), 80, True): r for r in results}
    for figure in figures:
        result = by_result.get(figure['resultId'])
        if not result or result.get('resultHash') != figure['resultHash'] or _number(result.get('n'), 0, 5000, True) != figure['n']:
            raise ApiError(422, 'figure_result_stale', '共享图形对应的结果版本已变化，请重新登记。')
    by_figure = {f['id']: f for f in figures}
    for key, pieces_key in (('report', 'blocks'), ('slides', 'objects')):
        for item in _list(content.get(key, []), 100 if key == 'report' else 40):
            if not isinstance(item, dict):
                raise ApiError()
            for piece in _list(item.get(pieces_key, []), 60):
                if not isinstance(piece, dict):
                    raise ApiError()
                if 'figureId' not in piece:
                    continue
                figure_id = _text(piece['figureId'], 80, True)
                figure = by_figure.get(figure_id)
                if version != 3 or piece.get('kind') not in ('chart', 'table') or not figure or figure['resultId'] != piece.get('evidenceId') or (piece['kind'] == 'table') != (figure['kind'] == 'table'):
                    raise ApiError()
    if 'reportFrame' in content:
        _frame(content['reportFrame'], style)
    return content

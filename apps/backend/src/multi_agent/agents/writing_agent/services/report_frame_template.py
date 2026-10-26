"""Trusted vector background. No template code is accepted from report text."""
from .report_frame_geometry import build_frame, FrameError
from .report_visuals import _frame
from shared.errors import ApiError


def _fmt(value):
    result = f'{value:.6f}'.rstrip('0').rstrip('.')
    return '0' if result in ('', '-0') else result


def checked_frame(frame, visual_style=None):
    if frame is None:
        return None
    try:
        _frame(frame, visual_style or {'paletteId': frame['palette']['id'], 'version': frame['palette']['version']})
        build_frame(frame, require_approved=True)
    except (FrameError, KeyError, TypeError, ValueError, OverflowError):
        raise ApiError(422, 'frame_unapproved', '请先预览并应用当前页框。') from None
    return frame


def frame_tex_preamble(frame):
    if frame['layout'] == 'none':
        return []
    primitives = build_frame(frame)['primitives']
    palette = frame['palette']
    definitions = [r'\definecolor{FramePrimary}{HTML}{' + palette['primary'][1:] + '}',
                   r'\definecolor{FrameSecondary}{HTML}{' + palette['secondary'][1:] + '}',
                   r'\definecolor{FrameAccent}{HTML}{' + palette['accent'][1:] + '}']
    def color(hex_value):
        return 'FramePrimary' if hex_value == palette['primary'] else 'FrameSecondary' if hex_value == palette['secondary'] else 'FrameAccent'
    draws = []
    for p in primitives:
        def blend(hex_value):
            return color(hex_value) + '!' + _fmt(p['opacity'] * 100) + '!white'
        fill = 'none' if p['fill'] == 'none' else blend(p['fill'])
        options = f"draw={blend(p['stroke'])},fill={fill},line width={_fmt(p['strokeWidthPt'])}pt,line cap=round,line join=round"
        if p['type'] == 'circle':
            geometry = f"({_fmt(p['cx'])},{_fmt(p['cy'])}) circle[radius={_fmt(p['r'])}mm]"
        else:
            points = p['points'] if p['type'] == 'polyline' else [(p['x1'], p['y1']), (p['x2'], p['y2'])]
            geometry = ' -- '.join(f'({_fmt(x)},{_fmt(y)})' for x, y in points)
        draws.append('\\draw[' + options + '] ' + geometry + ';')
    return [r'\usepackage{tikz}', *definitions, r'\newif\ifReportFrameActive', r'\ReportFrameActivefalse',
            r'\AddToHook{shipout/background}{\ifReportFrameActive',
            r'\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm]',
            r'\begin{scope}[shift={(current page.north west)}]', *draws,
            r'\end{scope}', r'\end{tikzpicture}', r'\fi}']

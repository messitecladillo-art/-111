"""Trusted aggregate-only TikZ renderer, byte-paired with report-figure-tex.ts.

This does not parse or execute user TeX. Callers validate a body containing only
the numeric ResearchFigure index token; this builder owns the drawing language.
"""
import math
from decimal import Decimal, ROUND_HALF_UP, localcontext
from .report_visuals import _figure, _visual_style, VISUAL_PALETTES


def _number(value, decimals=6):
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e12:
        raise ValueError("图形坐标或数值超出范围。")
    # Match ECMAScript Number.toFixed on the actual binary64 input, including
    # .125 ties and .145 representation; Decimal(str(value)) would not match.
    with localcontext() as context:
        context.prec = 50
        quantized = Decimal.from_float(float(value)).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)
    text = format(quantized, 'f')
    if decimals:
        text = text.rstrip('0').rstrip('.')
    return '0' if text in ('-0', '') else text


def _literal(value):
    replacements = {'\\': r'\textbackslash{}', '{': r'\{', '}': r'\}', '$': r'\$', '&': r'\&', '#': r'\#', '%': r'\%', '_': r'\_', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}'}
    return ''.join(' ' if c in '\r\n\t' else replacements.get(c, c) for c in value)


def _sum(values):
    total = 0.0
    for value in values:
        total += value
    return total


def registry_macro_names(count):
    if type(count) not in (int, float) or not math.isfinite(count) or count != int(count) or count < 0 or count > 120:
        raise ValueError('图形数量超过限制。')
    return [f'ResearchFigure{i}' for i in range(int(count))]


def _capacity(f):
    if f['kind'] == 'table':
        if len(f['table']['rows']) > 25 or len(f['table']['headers']) > 10:
            raise ValueError('正式表格最多25行、10列，请分拆后导出。')
    elif len(f['labels']) > 20 or len(f['series']) > 10 or len(f['boxes']) > 12 or len(f['bins']) > 20:
        raise ValueError('正式图形过密，请分拆为不超过20类、10系列或12组箱线；直方图最多20箱。')


def _drawing(value):
    f = _figure(value)
    _capacity(f)

    def fmt(value):
        return '—' if value is None else _number(value, int(f['style']['decimals']))

    if f['kind'] == 'table':
        def row(values):
            return ' & '.join(_literal(fmt(v) if type(v) in (int, float) else '—' if v is None else v) for v in values) + r' \\'
        return [r'\begingroup', r'\fontsize{9}{11}\selectfont', r'\renewcommand{\arraystretch}{1.15}', r'\begin{tabular}{' + 'c' * len(f['table']['headers']) + '}', r'\toprule[1.5bp]', row(f['table']['headers']), r'\midrule[0.75bp]', *[row(v) for v in f['table']['rows']], r'\bottomrule[1.5bp]', r'\end{tabular}', r'\endgroup']

    out = [r'\begin{tikzpicture}[x=0.1464mm,y=0.1464mm]', r'\path[use as bounding box] (0,0) rectangle (1000,700);']

    def point(x, y):
        return f'({_number(x)},{_number(700 - y)})'

    def color(index):
        return f'ResearchFigureColour{index}'

    def label(text, x, y, anchor='middle', ink='ResearchFigureInk', size=9):
        anch = 'west' if anchor == 'start' else 'east' if anchor == 'end' else 'center'
        out.append(f'\\node[anchor={anch},inner sep=0pt,text={ink},font={{\\fontsize{{{size}}}{{{size + 2}}}\\selectfont}}] at {point(x,y)} {{{_literal(text)}}};')

    def line(x1, y1, x2, y2, ink='ResearchFigureInk', width=.5):
        out.append(f'\\draw[draw={ink},line width={_number(width)}bp] {point(x1,y1)} -- {point(x2,y2)};')

    def rect(x, y, width, height, ink, opacity=1):
        out.append(f'\\path[fill={ink},fill opacity={_number(opacity)},draw=none] {point(x,y)} rectangle {point(x+width,y+height)};')

    label(f['title'], 50, 35, 'start', 'ResearchFigureInk', 10)
    label('n = ' + _number(f['n'], 0), 950, 35, 'end')
    top, bottom = 100, 485
    left, right = (250 if f['kind'] in ('horizontal_bar', 'heatmap') else 115), 945
    w, h = right - left, bottom - top
    if f['kind'] == 'boxplot':
        minimum, maximum = min(b['low'] for b in f['boxes']), max(b['high'] for b in f['boxes'])
        span = maximum - minimum or 1
        def y(v):
            return bottom - (v - minimum) / span * h
        for i in range(1 if maximum == minimum else 5):
            v = minimum + (maximum - minimum) * i / 4
            if f['style']['showGrid']:
                line(left, y(v), right, y(v), 'ResearchFigureGrid', .3)
            label(fmt(v), left - 14, y(v), 'end')
        for i, b in enumerate(f['boxes']):
            x, bw = left + w * (i + .5) / len(f['boxes']), min(80, w / len(f['boxes']) * .5)
            line(x, y(b['low']), x, y(b['high']), color(0), .7)
            line(x-bw/3, y(b['low']), x+bw/3, y(b['low']))
            line(x-bw/3, y(b['high']), x+bw/3, y(b['high']))
            rect(x-bw/2, y(b['q3']), bw, y(b['q1'])-y(b['q3']), color(4))
            line(x-bw/2, y(b['median']), x+bw/2, y(b['median']), color(0), 1)
            label(b['label'], x, bottom+35)
    elif f['kind'] == 'heatmap':
        values = [v for s in f['series'] for v in s['values'] if v is not None]
        minimum, maximum = min(values), max(values)
        span, cw, ch = maximum-minimum or 1, w/len(f['series']), h/len(f['labels'])
        for i, value in enumerate(f['labels']):
            label(value, left-14, top+(i+.5)*ch, 'end')
            for j, s in enumerate(f['series']):
                v = s['values'][i]
                opacity = 0 if v is None else .15+.85*(v-minimum)/span
                rect(left+j*cw, top+i*ch, cw, ch, color(0), opacity)
                if f['style']['showLabels']:
                    label(fmt(v), left+(j+.5)*cw, top+(i+.5)*ch, 'middle', 'ResearchFigureWhite' if opacity>.6 else 'ResearchFigureInk')
        for j, s in enumerate(f['series']):
            label(s['name'], left+(j+.5)*cw, bottom+35)
        label(f'{fmt(minimum)} — {fmt(maximum)}', right, 595, 'end')
    else:
        horizontal, hist = f['kind']=='horizontal_bar', f['kind']=='histogram'
        labels = [f"{fmt(b['start'])}–{fmt(b['end'])}" for b in f['bins']] if hist else f['labels']
        if hist:
            series = [{'name':'频数','values':[b['count'] for b in f['bins']]}]
        elif f['kind']=='percent_stacked':
            series = [{'name':s['name'],'values':[100*(v or 0)/_sum(item['values'][i] or 0 for item in f['series']) for i,v in enumerate(s['values'])]} for s in f['series']]
        else:
            series = f['series']
        values = [v for s in series for v in s['values'] if v is not None]
        minimum = 0 if f['kind']=='percent_stacked' else min(0,*values)
        maximum = 100 if f['kind']=='percent_stacked' else max(0,*values)
        span = maximum-minimum or 1
        def y(v):
            return bottom-(v-minimum)/span*h
        def x(v):
            return left+(v-minimum)/span*w
        for i in range(5):
            v = minimum+span*i/4
            if horizontal:
                if f['style']['showGrid']:
                    line(x(v),top,x(v),bottom,'ResearchFigureGrid',.3)
                label(fmt(v),x(v),bottom+35)
            else:
                if f['style']['showGrid']:
                    line(left,y(v),right,y(v),'ResearchFigureGrid',.3)
                label(fmt(v)+('%' if f['kind']=='percent_stacked' else ''),left-14,y(v),'end')
        for i, value in enumerate(labels):
            slot = (h if horizontal else w)/len(labels)
            label(value,left-14 if horizontal else left+slot*(i+.5),top+slot*(i+.5) if horizontal else bottom+35,'end' if horizontal else 'middle')
            stacked = 0
            for j,s in enumerate(series):
                v = s['values'][i]
                if v is None:
                    continue
                if f['kind']=='percent_stacked':
                    rect(left+slot*(i+.16),y(stacked+v),slot*.68,v/span*h,color(j))
                    if f['style']['showLabels'] and v>=7:
                        label(fmt(v)+'%',left+slot*(i+.5),y(stacked+v/2),'middle','ResearchFigureWhite' if j<3 else 'ResearchFigureInk')
                    stacked += v
                elif horizontal:
                    rh = slot*.7/len(series)
                    rect(min(x(v),x(0)),top+slot*(i+.15)+j*rh,abs(x(v)-x(0)),rh*.95,color(j))
                    if f['style']['showLabels']:
                        label(fmt(v),x(v)+(-9 if v<0 else 9),top+slot*(i+.15)+(j+.5)*rh,'end' if v<0 else 'start')
                else:
                    constant = hist and f['bins'][0]['start']==f['bins'][-1]['end']
                    bin_range = f['bins'][-1]['end']-f['bins'][0]['start'] if hist else 1
                    bw = (w if constant else (f['bins'][i]['end']-f['bins'][i]['start'])/bin_range*w) if hist else slot*.7/len(series)
                    px = (left if constant else left+(f['bins'][i]['start']-f['bins'][0]['start'])/bin_range*w) if hist else left+slot*(i+.15)+j*bw
                    rect(px,min(y(v),y(0)),bw*(1 if hist else .95),abs(y(v)-y(0)),color(j))
                    if f['style']['showLabels']:
                        label(fmt(v),px+bw*.5,y(v)+(22 if v<0 else -10))
        line(left,bottom,right,bottom)
        if len(series)>1:
            for i,s in enumerate(series):
                px,py=left+(i%4)*w/4,555+(i//4)*27
                rect(px,py-7,13,13,color(i))
                label(s['name'],px+20,py,'start')
    if f['style']['showBorder']:
        out.append(f'\\draw[draw=ResearchFigureInk,line width=0.5bp] {point(2,2)} rectangle {point(998,698)};')
    label(f['yLabel'] if f['kind']=='horizontal_bar' else f['xLabel'],525,650)
    if f['yLabel']:
        label(f['xLabel'] if f['kind']=='horizontal_bar' else f['yLabel'],50,75,'start')
    out.append(r'\end{tikzpicture}')
    if f['note']:
        out.append(r'{\fontsize{9}{11}\selectfont '+_literal(f['note'])+r'\par}')
    return out


def figure_tex_preamble(figures, style):
    if not isinstance(figures,list):
        raise ValueError('图形目录无效。')
    registry_macro_names(len(figures))
    palette=VISUAL_PALETTES[_visual_style(style)['paletteId']]
    out=[r'\definecolor{ResearchFigureInk}{HTML}{263D4D}',r'\definecolor{ResearchFigureGrid}{HTML}{E4E9EC}',r'\definecolor{ResearchFigureWhite}{HTML}{FFFFFF}']
    for i in range(20):
        out.append(f'\\definecolor{{ResearchFigureColour{i}}}{{HTML}}{{{palette[i%len(palette)][1:]}}}')
    out.append(r'\providecommand{\ResearchFigure}[1]{\ifcsname ResearchFigure#1\endcsname\csname ResearchFigure#1\endcsname\else\PackageError{researchfigure}{Unknown figure index}{}\fi}')
    for i,figure in enumerate(figures):
        out.extend([f'\\expandafter\\def\\csname ResearchFigure{i}\\endcsname{{',*_drawing(figure),'}'])
    return out

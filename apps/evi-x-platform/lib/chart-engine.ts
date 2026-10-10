import * as engine from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, BoxplotChart, TreemapChart, HeatmapChart, CustomChart } from 'echarts/charts';
import { GridComponent, TitleComponent, LegendComponent, TooltipComponent, GraphicComponent, VisualMapComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

// Static imports let the bundler discard unregistered chart engines.
engine.use([BarChart, LineChart, PieChart, ScatterChart, BoxplotChart, TreemapChart, HeatmapChart, CustomChart, GridComponent, TitleComponent, LegendComponent, TooltipComponent, GraphicComponent, VisualMapComponent, AriaComponent, SVGRenderer]);
export { engine };

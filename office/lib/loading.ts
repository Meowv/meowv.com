import 'ranui/loading';
import { Div, View } from 'ranui/builder';

// Full-screen loading overlay. Structure via the ranui builder (ecosystem
// convention), visuals via .loading-mask in styles/base.css (token layer).
export const showLoading = (): { removeLoading: () => void } => {
  const mask = Div()
    .class('loading-mask')
    .children(View('r-loading').attr('name', 'circle').attr('size', 'large').build())
    .build();
  document.body.appendChild(mask);
  return {
    removeLoading: () => {
      mask.remove();
    },
  };
};

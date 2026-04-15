import './RadarBackground.css';

export default function RadarBackground() {
  return (
    <div className="radar-bg" aria-hidden="true">
      <div className="ambient-glow" />
      <div className="radar-rings" />
      <div className="crosshairs" />
      <div className="hex-grid" />
      <div className="sweep-primary" />
      <div className="particles">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>
      <div className="scanlines" />
      <div className="vignette" />

      <div className="hud-corners">
        <div className="hud-corner tl" />
        <div className="hud-corner tr" />
        <div className="hud-corner bl" />
        <div className="hud-corner br" />
      </div>
      <div className="hud-data top-left">sys:online &bull; radar:active</div>
      <div className="hud-data top-right">sector 7-G &bull; alt:35000ft</div>
      <div className="hud-data bottom-left">lat:42.3601 &bull; lon:-71.0589</div>
      <div className="hud-data bottom-right">sig:nominal &bull; tgt:locked</div>
    </div>
  );
}

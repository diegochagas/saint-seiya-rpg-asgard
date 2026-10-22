/* Active Time Battle gauges: fill per frame by agility share, decide who is ready to act.
   Gauges stop while actions run, animations play or events run (scene decides via canFill). */
var ATB_START_NORMAL = 150000;
var ATB_WAIT_MODE = 1;   /* SaveSystem.atb_mode: 0 active, 1 wait */

var BattleATB = {
  /* battlers whose gauge moves: alive, on the field (dead/restricted ones keep their value) */
  fillable: function (b) { return b.exists ? b.exists() : !b.isDead() && !b.hidden; },
  agilitySum: function (battlers) {
    return battlers.filter(function (b) { return !b.hidden; }).reduce(function (s, b) { return s + b.agi(); }, 0);
  },
  /** Gauges at battle start for the given condition (EasyRPG S3:171-202). */
  initialGauges: function (actors, enemies, condition, firstStrike) {
    var preemptive = actors.some(function (a) { return a.weapons().some(function (w) { return w.preemptive; }); });
    var forActors = { 1: ATB_MAX, 3: ATB_MAX, 2: 0, 4: 0 }[condition];
    var forEnemies = { 1: 0, 3: 0, 2: ATB_MAX, 4: ATB_MAX }[condition];
    if (condition === CONDITION.NONE) {
      forActors = firstStrike || preemptive ? ATB_MAX : ATB_START_NORMAL;
      forEnemies = firstStrike ? 0 : ATB_START_NORMAL;
    }
    actors.forEach(function (a) { a.atbGauge = forActors; });
    enemies.forEach(function (e) { e.atbGauge = forEnemies; });
  },
  /** one frame of filling; `queued(b)` tells whether b already has an action waiting */
  fill: function (battlers, queued) {
    var sum = this.agilitySum(battlers);
    battlers.forEach(function (b) {
      if (queued(b) || !BattleATB.fillable(b) || (!b.isEnemy && !b.canAct())) return;
      b.atbGauge = Math.min(ATB_MAX, b.atbGauge + BattleRules.atbIncrement(b.agi(), sum));
    });
  },
  isFull: function (b) { return b.atbGauge >= ATB_MAX; },
  waitMode: function () { return GameState.atbMode === ATB_WAIT_MODE; },
};

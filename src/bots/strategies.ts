import type { AppLanguage } from "@/i18n/settings";
import { resolveLanguage } from "@/i18n/settings";

import momentumStrategyEn from "@/bots/momentum/strategy.md?raw";
import meanReversionStrategyEn from "@/bots/mean-reversion/strategy.md?raw";
import trendFollowerStrategyEn from "@/bots/trend-follower/strategy.md?raw";
import mlMeanStrategyEn from "@/bots/ml-mean/strategy.md?raw";
import mlTrendStrategyEn from "@/bots/ml-trend/strategy.md?raw";

type BotStrategyKey = "momentum" | "mean-reversion" | "trend-follower" | "ml-mean" | "ml-trend";

const botStrategyKeysById: Record<string, BotStrategyKey> = {
  "1": "momentum",
  "2": "mean-reversion",
  "3": "trend-follower",
  "5": "ml-mean",
  "6": "ml-trend",
};

const strategyTranslations: Record<BotStrategyKey, Record<AppLanguage, string>> = {
  momentum: {
    ar: `# استراتيجية Momentum Scalper

- راقب فقط الفرق بين آخر سعر والسعر السابق.
- إذا ارتفع السعر بنحو 0.1% وكان هناك نقد كافٍ للوت واحد، يشتري الروبوت.
- إذا انخفض السعر بنحو 0.1% وكان هناك لوت واحد على الأقل في الحيازة، يبيع الروبوت.
- خلاف ذلك، يُبقي المركز الحالي دون تغيير.`,
    en: momentumStrategyEn,
    fr: `# Strategie Momentum Scalper

- Observe uniquement l'ecart entre le dernier prix et le tick precedent.
- Si le prix monte d'environ 0,1 % et qu'il y a assez de cash pour un lot, le bot achete.
- Si le prix baisse d'environ 0,1 % et qu'au moins un lot est detenu, le bot vend.
- Sinon, il conserve la position existante sans y toucher.`,
    ru: `# Стратегия Momentum Scalper

- Отслеживает только разницу между последней ценой и предыдущим тиком.
- Если цена растет примерно на 0,1 % и есть достаточно средств на один лот, бот покупает.
- Если цена падает примерно на 0,1 % и удерживается хотя бы один лот, бот продает.
- В остальных случаях текущая позиция остается без изменений.`,
    zh: `# Momentum Scalper 策略

- 只观察最新价格与前一笔报价之间的变化。
- 如果价格上涨约 0.1%，且现金足够买入一手，机器人就买入。
- 如果价格下跌约 0.1%，且至少持有一手仓位，机器人就卖出。
- 否则维持当前仓位不变。`,
  },
  "mean-reversion": {
    ar: `# استراتيجية Mean Reversion Pro

- تستفيد من نطاقات بولينجر المضبوطة على 20 فترة / 2 انحراف معياري.
- تحسب قيمة z-score مقابل النطاق الأوسط لاكتشاف المبالغة في الابتعاد.
- تشتري عندما يكون السعر أقل من المتوسط بمقدار 1.5 انحراف معياري، وتبيع عندما يكون أعلى منه بمقدار 1.5.
- تُحتفظ بالمراكز خلال اليوم مع إدارة المخاطر على مستوى المحفظة.`,
    en: meanReversionStrategyEn,
    fr: `# Strategie Mean Reversion Pro

- Exploite des bandes de Bollinger reglees sur 20 periodes / 2 ecarts-types.
- Calcule un z-score par rapport a la bande mediane pour detecter les ecarts excessifs.
- Achete quand le prix est 1,5 ecart-type sous la moyenne ; vend quand il est 1,5 ecart-type au-dessus.
- Les positions sont conservees en intraday avec une gestion du risque au niveau du portefeuille.`,
    ru: `# Стратегия Mean Reversion Pro

- Использует полосы Боллинджера с параметрами 20 периодов / 2 стандартных отклонения.
- Рассчитывает z-score относительно средней полосы для поиска чрезмерных отклонений.
- Покупает, когда цена находится на 1,5 стандартного отклонения ниже среднего; продает, когда на 1,5 выше.
- Позиции удерживаются внутри дня, а риск контролируется на уровне портфеля.`,
    zh: `# Mean Reversion Pro 策略

- 使用参数为 20 周期 / 2 倍标准差的布林带。
- 计算相对中轨的 z-score，以识别价格过度偏离。
- 当价格低于均值 1.5 个标准差时买入；高于均值 1.5 个标准差时卖出。
- 持仓以日内为主，风险控制在组合层面完成。`,
  },
  "trend-follower": {
    ar: `# استراتيجية Trend Follower Elite

- يتابع المتوسطات المتحركة الأسية EMA20 / EMA50 / EMA200 لتحديد الاصطفاف الصاعد أو الهابط.
- يدخل شراء عند اكتمال الاصطفاف الصاعد، وبيعًا على المكشوف عند اكتمال الاصطفاف الهابط.
- يتجنب الصفقات عندما تكون المتوسطات مختلطة للحد من الضوضاء.
- يستخدم تأكيدًا من إطار زمني أعلى قبل التنفيذ.`,
    en: trendFollowerStrategyEn,
    fr: `# Strategie Trend Follower Elite

- Suit les EMA 20 / 50 / 200 pour detecter un alignement haussier ou baissier.
- Entre long quand l'empilement haussier est complet ; entre short quand l'empilement baissier est complet.
- Evite les trades lorsque les moyennes mobiles sont melangees afin de limiter le bruit.
- Utilise une confirmation sur unite de temps superieure avant l'execution.`,
    ru: `# Стратегия Trend Follower Elite

- Отслеживает EMA 20 / 50 / 200 для поиска бычьего или медвежьего выравнивания.
- Открывает long при полном бычьем наборе EMA и short при полном медвежьем.
- Избегает сделок, когда скользящие средние смешаны, чтобы сократить шум.
- Перед исполнением использует подтверждение с более высокого таймфрейма.`,
    zh: `# Trend Follower Elite 策略

- 跟踪 EMA20 / EMA50 / EMA200，以识别多头或空头排列。
- 当均线形成完整多头排列时做多；形成完整空头排列时做空。
- 当均线方向混杂时避免交易，以减少震荡噪音。
- 执行前结合更高时间框架进行确认。`,
  },
  "ml-mean": {
    ar: `# روبوت ML Mean Reversion

يستخدم هذا الروبوت نموذج انحدار لوجستي مدربًا على عامين من أسعار الإغلاق اليومية لتقدير احتمال أن يغلق الغد على ارتفاع.

- **الميزات**: z-score لمدة 20 يومًا، التغير اليومي بالنسبة المئوية، معدل التغير خلال 5 جلسات و RSI14.
- **القياس**: يتم توحيد كل ميزة باستخدام متجهات \`mean\` و \`scale\` المصدّرة في \`ml-models/mean_reversion_model.json\`.
- **القرار**: شراء إذا كانت \`P(up) >= 0.58\`، وبيع إذا كانت \`P(up) <= 0.42\`، وإلا الانتظار.
- **المخاطر**: حجم لوت ثابت مع التحقق من توفر السيولة قبل تنفيذ الصفقة.`,
    en: mlMeanStrategyEn,
    fr: `# Bot ML Mean Reversion

Ce bot execute une regression logistique entrainee sur deux ans de clotures quotidiennes afin d'estimer la probabilite que la seance de demain se termine en hausse.

- **Features** : z-score sur 20 jours, variation quotidienne en pourcentage, rate of change sur 5 seances et RSI14.
- **Scaling** : chaque feature est standardisee a l'aide des vecteurs \`mean\` / \`scale\` exportes dans \`ml-models/mean_reversion_model.json\`.
- **Decision** : achat si \`P(up) >= 0.58\`, vente si \`P(up) <= 0.42\`, sinon attente.
- **Risk** : taille de lot fixe et verification de la tresorerie disponible avant l'ordre.`,
    ru: `# Бот ML Mean Reversion

Этот бот использует логистическую регрессию, обученную на двух годах дневных цен закрытия, чтобы оценить вероятность того, что завтрашняя сессия закроется выше.

- **Признаки**: 20-дневный z-score, дневное процентное изменение, rate of change за 5 сессий и RSI14.
- **Масштабирование**: каждый признак стандартизируется с помощью векторов \`mean\` и \`scale\`, экспортированных в \`ml-models/mean_reversion_model.json\`.
- **Решение**: покупка при \`P(up) >= 0.58\`, продажа при \`P(up) <= 0.42\`, иначе удержание.
- **Риск**: фиксированный размер лота и проверка доступных средств перед отправкой ордера.`,
    zh: `# ML 均值回归机器人

该机器人使用基于两年日收盘价训练的逻辑回归模型，估计明天收盘上涨的概率。

- **特征**：20 日 z-score、日百分比变化、5 个交易日变化率以及 RSI14。
- **标准化**：所有特征都使用 \`ml-models/mean_reversion_model.json\` 中导出的 \`mean\` / \`scale\` 向量进行标准化。
- **决策**：当 \`P(up) >= 0.58\` 时买入；当 \`P(up) <= 0.42\` 时卖出；否则保持观望。
- **风控**：固定手数，并在下单前检查现金是否充足。`,
  },
  "ml-trend": {
    ar: `# روبوت ML Trend

يستخدم روبوت ML Trend نموذج Gradient Boosting الناتج عن \`scripts/ml/train_models.py\` لتوقع عوائد خمسة أيام.

- **الميزات**: فرق EMA20 / EMA50، وفرق EMA50 / EMA100، وزخم 5 أيام، و RSI14، و ATR مملس.
- **النموذج**: \`HistGradientBoostingRegressor\` محمّل من \`trend_model.pkl\` (يتطلب joblib و scikit-learn وقت التشغيل).
- **الإشارة**: شراء إذا كان العائد المتوقع أعلى من +0.25 %، وبيع إذا كان أقل من -0.10 %، وإلا الانتظار.
- **التنفيذ**: حجم لوت ثابت مع حواجز على السيولة والمركز إضافة إلى لقطات الثروة في Firestore.`,
    en: mlTrendStrategyEn,
    fr: `# Bot ML Trend

Le bot ML Trend consomme le modele de Gradient Boosting produit par \`scripts/ml/train_models.py\` pour anticiper les rendements sur 5 jours.

- **Features** : spread EMA20 / EMA50, spread EMA50 / EMA100, momentum 5 jours, RSI14 et ATR lisse.
- **Model** : \`HistGradientBoostingRegressor\` charge depuis \`trend_model.pkl\` (necessite joblib + scikit-learn a l'execution).
- **Signal** : achat si le rendement attendu est superieur a +0.25 %, vente s'il est inferieur a -0.10 %, sinon attente.
- **Execution** : taille de lot fixe avec garde-fous sur cash et position, plus snapshots de richesse Firestore.`,
    ru: `# Бот ML Trend

Бот ML Trend использует модель Gradient Boosting, созданную в \`scripts/ml/train_models.py\`, чтобы прогнозировать доходность на 5 дней вперед.

- **Признаки**: спред EMA20 / EMA50, спред EMA50 / EMA100, 5-дневный моментум, RSI14 и сглаженный ATR.
- **Модель**: \`HistGradientBoostingRegressor\`, загружаемый из \`trend_model.pkl\` (требуются joblib и scikit-learn во время выполнения).
- **Сигнал**: покупка, если ожидаемая доходность выше +0.25 %, продажа, если ниже -0.10 %, иначе удержание.
- **Исполнение**: фиксированный размер лота с ограничениями по cash и позиции, плюс snapshots благосостояния в Firestore.`,
    zh: `# ML 趋势机器人

ML Trend 机器人使用由 \`scripts/ml/train_models.py\` 生成的 Gradient Boosting 模型来预测未来 5 天收益。

- **特征**：EMA20 / EMA50 差值、EMA50 / EMA100 差值、5 日动量、RSI14 和平滑 ATR。
- **模型**：从 \`trend_model.pkl\` 加载的 \`HistGradientBoostingRegressor\`（运行时需要 joblib 和 scikit-learn）。
- **信号**：若预期收益高于 +0.25 % 则买入；若低于 -0.10 % 则卖出；否则持有。
- **执行**：固定手数，并对现金和持仓设置保护，同时写入 Firestore 财富快照。`,
  },
};

export function getBotStrategy(botId: string, language?: string | null): string {
  const strategyKey = botStrategyKeysById[botId];
  if (!strategyKey) return "";
  const resolvedLanguage = resolveLanguage(language);
  return strategyTranslations[strategyKey][resolvedLanguage] ?? strategyTranslations[strategyKey].en;
}

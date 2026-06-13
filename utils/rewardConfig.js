const TIERS = {
  bronze: {
    rewardAmount: 500000,
    requirements: { followers: 10000, posts: 3000, sales: 10 },
  },
  silver: {
    rewardAmount: 1000000,
    requirements: { followers: 100000, posts: 5000, sales: 18 },
  },
  gold: {
    rewardAmount: 2000000,
    requirements: { followers: 500000, posts: 8000, sales: 30 },
  },
};

const SALE_COMMISSION_RATE = 0.01;
const RENT_COMMISSION_RATE = 0.005;
const REFERRAL_SIGNUP_BONUS = 2500;

const getTierConfig = (tier) => TIERS[tier] || null;

const getUserSalesCount = (user) => (user.propertiesSold || 0) + (user.propertiesRented || 0);

const meetsTierRequirements = (user, tier) => {
  const config = getTierConfig(tier);
  if (!config) return false;

  const sales = getUserSalesCount(user);
  return (
    (user.followersCount || 0) >= config.requirements.followers &&
    (user.postsCount || 0) >= config.requirements.posts &&
    sales >= config.requirements.sales
  );
};

const calculateCommission = (purpose, price) => {
  const amount = Number(price) || 0;
  if (purpose === 'rent') {
    return Math.round(amount * RENT_COMMISSION_RATE);
  }
  return Math.round(amount * SALE_COMMISSION_RATE);
};

module.exports = {
  TIERS,
  SALE_COMMISSION_RATE,
  RENT_COMMISSION_RATE,
  REFERRAL_SIGNUP_BONUS,
  getTierConfig,
  getUserSalesCount,
  meetsTierRequirements,
  calculateCommission,
};

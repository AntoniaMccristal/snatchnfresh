type BrandMarkProps = {
  size?: number;
  className?: string;
  color?: string;
};

export default function BrandMark({
  size = 28,
  className = "",
  color = "#EBC2B9",
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Snatch'n logo"
      role="img"
    >
      <path
        fill={color}
        d="M24 78c0-26 21-47 47-47h114c26 0 47 21 47 47v24H74c-11 0-20 9-20 20s9 20 20 20h112c26 0 46 20 46 46v1c0 26-21 47-47 47H24v-66h157c11 0 20-9 20-20s-9-20-20-20H71c-26 0-47-21-47-47v-5Z"
      />
    </svg>
  );
}

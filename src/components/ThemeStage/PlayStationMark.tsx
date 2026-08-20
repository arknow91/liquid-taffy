/* The PlayStation mark, as supplied — the badge that says which frame the
   dark option is. Drawn at its own colours in both themes: the mark IS its
   colours, and a recoloured logo is a different logo. */

type PlayStationMarkProps = {
  className?: string;
};

export function PlayStationMark({ className }: PlayStationMarkProps) {
  return (
    <svg
      className={className}
      width="135"
      height="102"
      viewBox="0 0 135 102"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M72.095 22.0814L72.0099 100.177L51.0859 93.3716V1.57812L77.7942 8.6394C94.8903 13.2342 105.353 22.1658 105.182 37.8191C105.012 56.0252 96.5917 63.3405 80.1755 58.5765V22.6758C80.1755 18.3369 72.095 18.0828 72.095 22.0814Z"
        fill="#DE0029"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M41.4768 78.2265L31.6098 81.5452C25.2296 83.7576 19.7867 78.5684 25.6556 76.4403L30.4185 74.7401L12.471 69.0391C6.94188 70.9115 1.753 74.9098 2.09406 80.5249C2.43432 86.224 15.4478 87.5859 25.4855 89.2024C34.8415 90.7329 43.3474 89.8824 51.0887 87.16V81.2895L41.4768 78.2265ZM72.1829 100.176L90.4706 93.7953L72.0129 87.9262V99.7501L72.1829 100.176Z"
        fill="#F3C202"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M120.835 83.0759L121.175 82.9902C129.171 80.1838 132.573 76.269 131.723 72.6122C130.362 66.4874 120.58 63.1688 105.525 62.0626C94.7224 61.2975 84.0903 63.6788 73.7131 67.2515L72.0117 67.8477L90.6397 73.6325L101.527 69.9739C112.925 67.8477 117.519 71.5903 106.546 75.0787L101.102 76.9492L120.835 83.0759ZM51.0875 56.0234L42.8359 58.8299L51.0875 61.3823V56.0234Z"
        fill="#326DB3"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M90.4681 93.796L120.834 83.078L101.1 76.9513L72.0103 86.9048V87.9269L90.4681 93.796ZM51.0864 74.9949L41.4745 78.2275L51.0864 81.2902V74.9949ZM72.0103 80.0156V67.8498L90.6383 73.6346L72.0103 80.0156ZM30.4162 74.7408L51.0861 67.3395V61.3844L42.8348 58.832L12.8939 68.9557C12.8088 68.9557 12.6388 69.0398 12.4688 69.0398L30.4162 74.7408Z"
        fill="#00AA9E"
      />
    </svg>
  );
}

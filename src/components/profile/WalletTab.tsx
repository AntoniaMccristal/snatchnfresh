import SnatchnWallet from "@/components/SnatchnWallet";

type WalletTabProps = {
  userId: string;
  stripeConnected: boolean;
  onConnectStripe: () => void;
};

export default function WalletTab({ userId, stripeConnected, onConnectStripe }: WalletTabProps) {
  return (
    <section className="space-y-3">
      <SnatchnWallet
        userId={userId}
        stripeConnected={stripeConnected}
        onConnectStripe={onConnectStripe}
      />
    </section>
  );
}

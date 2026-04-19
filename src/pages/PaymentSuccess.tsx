import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

const PaymentSuccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const bookingId = params.get("bookingId");

    if (!bookingId) {
      navigate("/profile");
      return;
    }

    const timer = window.setTimeout(() => {
      navigate("/profile");
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [navigate, params]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Booking request sent</h1>
        <p className="text-sm text-gray-500">
          Your payment was received and your request is now waiting for lender approval.
        </p>
      </div>
    </div>
  );
};

export default PaymentSuccess;

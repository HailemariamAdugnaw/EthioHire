"""EthioHire — site-wide Django response headers."""


class COOPHeaderMiddleware:
    """Cross-Origin-Opener-Policy: same-origin-allow-popups.

    Required for Firebase signInWithPopup: without it Chrome isolates the
    auth popup into a different browsing context group and the Firebase SDK's
    window.closed polling logs
    "Cross-Origin-Opener-Policy policy would block the window.closed call"
    (the popup flow can then stall). "same-origin-allow-popups" keeps the
    opener/popup pair in the same group while staying safe otherwise.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.headers.setdefault(
            "Cross-Origin-Opener-Policy", "same-origin-allow-popups"
        )
        return response

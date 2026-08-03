import com.orbitgard.paymob.PaymobProperties;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.HttpClientSettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class PaymobConfig {

    @Bean("paymobRestClient")
    public RestClient paymobRestClient(PaymobProperties props) {

        HttpClientSettings settings = HttpClientSettings.defaults()
                .withConnectTimeout(props.getConnectTimeout())
                .withReadTimeout(props.getReadTimeout());

        return RestClient.builder()
                .baseUrl(props.getBaseUrl())
                .requestFactory(
                        ClientHttpRequestFactoryBuilder.detect().build(settings)
                )
                .build();
    }
}